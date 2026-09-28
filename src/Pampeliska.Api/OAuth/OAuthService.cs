using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Pampeliska.Api.OAuth;

public record TokenPair(string AccessToken, string RefreshToken, int ExpiresIn, string Scope);

/// <summary>Výsledek token endpointu: buď tokeny, nebo chyba dle RFC 6749 §5.2.</summary>
public record TokenResult(TokenPair? Tokens, string? Error = null, string? ErrorDescription = null)
{
    public static TokenResult Fail(string error, string description) => new(null, error, description);
}

public record McpConnection(int Id, string ClientName, string RedirectHost, string UserEmail, string Scope, DateTimeOffset CreatedAt,
    DateTimeOffset? LastUsedAt, DateTimeOffset ExpiresAt);

/// <summary>
/// Autorizační server pro MCP: registrace klientů, autorizační kódy s PKCE, access/refresh tokeny s rotací.
/// Tokeny jsou náhodné řetězce, v DB je jen jejich SHA-256. Jen přenositelné EF dotazy (testy běží nad InMemory).
/// </summary>
public class OAuthService(AppDbContext db, TimeProvider time, IOptions<McpOAuthOptions> options)
{
    /// <summary>Výměna kódu a rotace refresh tokenu nesmí proběhnout dvakrát souběžně se stejným tokenem.</summary>
    private static readonly SemaphoreSlim ExchangeGate = new(1, 1);

    private McpOAuthOptions Opt => options.Value;
    private DateTimeOffset Now => time.GetUtcNow();

    public const int MaxPendingClients = 100;

    public async Task<(OAuthClient client, string? secret)> RegisterAsync(string? name, IReadOnlyList<string> redirectUris, bool confidential)
    {
        var client = new OAuthClient
        {
            Id = OAuthCrypto.NewToken("pmp_c_")[..28],
            Name = SanitizeName(name),
            RedirectUris = redirectUris.ToList(),
            CreatedAt = Now,
        };
        string? secret = null;
        if (confidential)
        {
            secret = OAuthCrypto.NewToken("pmp_cs_");
            client.SecretHash = OAuthCrypto.Hash(secret);
        }
        db.OAuthClients.Add(client);
        await db.SaveChangesAsync();
        return (client, secret);
    }

    /// <summary>Počet registrací, které ještě nikdy nedostaly přístup – ochrana proti zaplevelení otevřenou registrací.</summary>
    public Task<int> PendingClientCountAsync() =>
        db.OAuthClients.CountAsync(c => c.LastAuthorizedAt == null);

    public Task<OAuthClient?> FindClientAsync(string? clientId) =>
        string.IsNullOrEmpty(clientId) ? Task.FromResult<OAuthClient?>(null) : db.OAuthClients.FirstOrDefaultAsync(c => c.Id == clientId);

    /// <summary>Veřejný klient (bez tajemství) projde vždy – chrání ho PKCE; důvěrný musí poslat správné tajemství.</summary>
    public static bool ClientAuthenticated(OAuthClient client, string? secret) =>
        client.SecretHash is null || (secret is not null && OAuthCrypto.FixedTimeEquals(client.SecretHash, OAuthCrypto.Hash(secret)));

    public async Task<string> CreateCodeAsync(OAuthClient client, string redirectUri, string codeChallenge, string resource,
        string userEmail, string? userName, string scope)
    {
        var code = OAuthCrypto.NewToken("pmp_ac_");
        db.OAuthAuthorizationCodes.Add(new OAuthAuthorizationCode
        {
            CodeHash = OAuthCrypto.Hash(code),
            ClientId = client.Id,
            RedirectUri = redirectUri,
            CodeChallenge = codeChallenge,
            Resource = resource,
            Scope = scope,
            UserEmail = userEmail,
            UserName = userName,
            CreatedAt = Now,
            ExpiresAt = Now.AddMinutes(Opt.AuthorizationCodeMinutes),
        });
        await db.SaveChangesAsync();
        return code;
    }

    public async Task<TokenResult> ExchangeCodeAsync(OAuthClient client, string? code, string? redirectUri, string? codeVerifier, string? resource)
    {
        if (string.IsNullOrEmpty(code)) return TokenResult.Fail("invalid_request", "Chybí code.");
        await ExchangeGate.WaitAsync();
        try
        {
            var hash = OAuthCrypto.Hash(code);
            var ac = await db.OAuthAuthorizationCodes.FirstOrDefaultAsync(c => c.CodeHash == hash);
            if (ac is null || ac.ClientId != client.Id)
                return TokenResult.Fail("invalid_grant", "Neplatný autorizační kód.");
            if (ac.ConsumedAt is not null)
            {
                // Opakované použití kódu = možný únik → zrušit vše, co z něj vzniklo (RFC 6749 §4.1.2)
                if (ac.GrantId is { } gid) await RevokeGrantAsync(gid);
                return TokenResult.Fail("invalid_grant", "Autorizační kód už byl použit.");
            }
            if (ac.ExpiresAt <= Now)
                return TokenResult.Fail("invalid_grant", "Autorizační kód vypršel.");
            if (redirectUri is null || !string.Equals(redirectUri, ac.RedirectUri, StringComparison.Ordinal))
                return TokenResult.Fail("invalid_grant", "redirect_uri neodpovídá autorizačnímu požadavku.");
            if (!OAuthCrypto.VerifyPkce(codeVerifier, ac.CodeChallenge))
                return TokenResult.Fail("invalid_grant", "PKCE ověření selhalo (code_verifier).");
            if (resource is not null && !SameResource(resource, ac.Resource))
                return TokenResult.Fail("invalid_target", "resource neodpovídá autorizačnímu požadavku.");

            var grant = new OAuthGrant
            {
                ClientId = client.Id,
                UserEmail = ac.UserEmail,
                UserName = ac.UserName,
                Resource = ac.Resource,
                Scope = ac.Scope,
                CreatedAt = Now,
            };
            db.OAuthGrants.Add(grant);
            ac.ConsumedAt = Now;
            var pair = IssueTokens(grant, client);
            await db.SaveChangesAsync();
            ac.GrantId = grant.Id;
            await db.SaveChangesAsync();
            return new TokenResult(pair);
        }
        finally
        {
            ExchangeGate.Release();
        }
    }

    public async Task<TokenResult> RefreshAsync(OAuthClient client, string? refreshToken, string? resource)
    {
        if (string.IsNullOrEmpty(refreshToken)) return TokenResult.Fail("invalid_request", "Chybí refresh_token.");
        await ExchangeGate.WaitAsync();
        try
        {
            var hash = OAuthCrypto.Hash(refreshToken);
            var token = await db.OAuthTokens.Include(t => t.Grant)
                .FirstOrDefaultAsync(t => t.Hash == hash && t.Kind == OAuthTokenKind.Refresh);
            var grant = token?.Grant;
            if (token is null || grant is null || grant.ClientId != client.Id || grant.RevokedAt is not null || token.ExpiresAt <= Now)
                return TokenResult.Fail("invalid_grant", "Neplatný nebo vypršelý refresh token.");
            if (resource is not null && !SameResource(resource, grant.Resource))
                return TokenResult.Fail("invalid_target", "resource neodpovídá udělenému přístupu.");
            if (token.ConsumedAt is { } consumed && Now - consumed > TimeSpan.FromSeconds(Opt.RefreshReuseGraceSeconds))
            {
                // Starý (už rotovaný) refresh token použitý znovu po grace okně = pravděpodobně odcizený
                await RevokeGrantAsync(grant.Id);
                return TokenResult.Fail("invalid_grant", "Refresh token už byl použit.");
            }
            token.ConsumedAt ??= Now;
            var pair = IssueTokens(grant, client);
            await db.SaveChangesAsync();
            return new TokenResult(pair);
        }
        finally
        {
            ExchangeGate.Release();
        }
    }

    /// <summary>RFC 7009: zruší přístup, ke kterému token patří (jen pokud patří tomuto klientovi).</summary>
    public async Task RevokeTokenAsync(OAuthClient client, string? token)
    {
        if (string.IsNullOrEmpty(token)) return;
        var hash = OAuthCrypto.Hash(token);
        var grantId = await db.OAuthTokens.Where(t => t.Hash == hash && t.Grant!.ClientId == client.Id)
            .Select(t => (int?)t.GrantId).FirstOrDefaultAsync();
        if (grantId is { } id) await RevokeGrantAsync(id);
    }

    /// <summary>Ověří access token pro daný zdroj (kontrola audience). Vrací grant, nebo null.</summary>
    public async Task<OAuthGrant?> ValidateAccessTokenAsync(string token, string expectedResource)
    {
        var hash = OAuthCrypto.Hash(token);
        var t = await db.OAuthTokens.Include(x => x.Grant).ThenInclude(g => g!.Client)
            .FirstOrDefaultAsync(x => x.Hash == hash && x.Kind == OAuthTokenKind.Access);
        var grant = t?.Grant;
        if (t is null || grant is null || t.ExpiresAt <= Now || grant.RevokedAt is not null || !SameResource(grant.Resource, expectedResource))
            return null;
        if (grant.LastUsedAt is null || Now - grant.LastUsedAt > TimeSpan.FromMinutes(5))
        {
            grant.LastUsedAt = Now;
            await db.SaveChangesAsync();
        }
        return grant;
    }

    public async Task<List<McpConnection>> ListConnectionsAsync()
    {
        var now = Now;
        var grants = await db.OAuthGrants.AsNoTracking()
            .Include(g => g.Client)
            .Include(g => g.Tokens.Where(t => t.Kind == OAuthTokenKind.Refresh && t.ConsumedAt == null && t.ExpiresAt > now))
            .Where(g => g.RevokedAt == null)
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync();
        return grants
            .Where(g => g.Tokens.Count > 0)
            .Select(g => new McpConnection(g.Id, g.Client?.Name ?? g.ClientId,
                g.Client?.RedirectUris.FirstOrDefault() is { } r ? RedirectUriPolicy.DisplayHost(r) : "",
                g.UserEmail, g.Scope, g.CreatedAt, g.LastUsedAt, g.Tokens.Max(t => t.ExpiresAt)))
            .ToList();
    }

    /// <summary>Odpojí přístup: smaže jeho tokeny, grant zůstane označený jako zrušený (kvůli detekci opakovaného kódu).</summary>
    public async Task<bool> RevokeGrantAsync(int grantId)
    {
        var grant = await db.OAuthGrants.Include(g => g.Tokens).FirstOrDefaultAsync(g => g.Id == grantId);
        if (grant is null) return false;
        grant.RevokedAt ??= Now;
        db.OAuthTokens.RemoveRange(grant.Tokens);
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>Úklid prošlých kódů, tokenů, mrtvých přístupů a opuštěných registrací.</summary>
    public async Task<int> CleanupAsync()
    {
        var now = Now;
        var grace = now.AddSeconds(-Opt.RefreshReuseGraceSeconds);

        var codes = await db.OAuthAuthorizationCodes.Where(c => c.ExpiresAt < now.AddHours(-1)).ToListAsync();
        db.OAuthAuthorizationCodes.RemoveRange(codes);

        var tokens = await db.OAuthTokens
            .Where(t => t.ExpiresAt <= now || (t.ConsumedAt != null && t.ConsumedAt < grace))
            .ToListAsync();
        db.OAuthTokens.RemoveRange(tokens);
        await db.SaveChangesAsync();

        // Zrušené přístupy po 30 dnech, platné přístupy bez živého refresh tokenu (vypršely) hned
        var deadGrants = await db.OAuthGrants
            .Where(g => (g.RevokedAt != null && g.RevokedAt < now.AddDays(-30)) ||
                        (g.RevokedAt == null && g.CreatedAt < now.AddHours(-1) &&
                         !g.Tokens.Any(t => t.Kind == OAuthTokenKind.Refresh && t.ExpiresAt > now)))
            .ToListAsync();
        db.OAuthGrants.RemoveRange(deadGrants);
        await db.SaveChangesAsync();

        // Registrace, které do dne nezískaly přístup (opuštěné), a klienti bez přístupu déle než rok
        var clients = await db.OAuthClients
            .Where(c => !db.OAuthGrants.Any(g => g.ClientId == c.Id) &&
                        ((c.LastAuthorizedAt == null && c.CreatedAt < now.AddDays(-1)) || c.LastAuthorizedAt < now.AddDays(-365)))
            .ToListAsync();
        db.OAuthClients.RemoveRange(clients);
        await db.SaveChangesAsync();

        return codes.Count + tokens.Count + deadGrants.Count + clients.Count;
    }

    private TokenPair IssueTokens(OAuthGrant grant, OAuthClient client)
    {
        var access = OAuthCrypto.NewToken("pmp_at_");
        var refresh = OAuthCrypto.NewToken("pmp_rt_");
        var accessTtl = TimeSpan.FromMinutes(Opt.AccessTokenMinutes);
        grant.Tokens.Add(new OAuthToken
        {
            Kind = OAuthTokenKind.Access, Hash = OAuthCrypto.Hash(access), CreatedAt = Now, ExpiresAt = Now + accessTtl,
        });
        grant.Tokens.Add(new OAuthToken
        {
            Kind = OAuthTokenKind.Refresh, Hash = OAuthCrypto.Hash(refresh), CreatedAt = Now, ExpiresAt = Now.AddDays(Opt.RefreshTokenDays),
        });
        grant.LastUsedAt = Now;
        client.LastAuthorizedAt = Now;
        return new TokenPair(access, refresh, (int)accessTtl.TotalSeconds, grant.Scope);
    }

    /// <summary>Porovnání resource URI: bez ohledu na velikost písmen ve schématu/hostu a koncové lomítko.</summary>
    public static bool SameResource(string a, string b)
    {
        if (!Uri.TryCreate(a.TrimEnd('/'), UriKind.Absolute, out var ua) || !Uri.TryCreate(b.TrimEnd('/'), UriKind.Absolute, out var ub))
            return false;
        return Uri.Compare(ua, ub, UriComponents.SchemeAndServer | UriComponents.Path, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) == 0
               && string.Equals(ua.AbsolutePath, ub.AbsolutePath, StringComparison.Ordinal);
    }

    private static string SanitizeName(string? name)
    {
        var clean = new string((name ?? "").Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        if (clean.Length == 0) clean = "Neznámý klient";
        return clean.Length > 100 ? clean[..100] : clean;
    }
}

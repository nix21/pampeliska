using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Pampeliska.Api.OAuth;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Pampeliska.Tests.OAuth;

public class TestClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
    public void Advance(TimeSpan by) => Now += by;
}

public class OAuthServiceTests
{
    private const string Resource = "https://faktury.example.cz/mcp";
    private const string Redirect = "http://localhost:4567/callback";

    private readonly AppDbContext _db;
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 9, 22, 10, 0, 0, TimeSpan.Zero));
    private readonly OAuthService _svc;

    public OAuthServiceTests()
    {
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        _svc = new OAuthService(_db, _clock, Options.Create(new McpOAuthOptions()));
    }

    private static (string verifier, string challenge) Pkce()
    {
        var verifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        return (verifier, Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))));
    }

    private async Task<(OAuthClient client, string code, string verifier)> AuthorizeAsync()
    {
        var (client, _) = await _svc.RegisterAsync("Claude Code", [Redirect], confidential: false);
        var (verifier, challenge) = Pkce();
        var code = await _svc.CreateCodeAsync(client, Redirect, challenge, Resource, "test@example.com", "Test", "pampeliska.read pampeliska.write");
        return (client, code, verifier);
    }

    private async Task<(OAuthClient client, TokenPair tokens)> ConnectAsync()
    {
        var (client, code, verifier) = await AuthorizeAsync();
        var result = await _svc.ExchangeCodeAsync(client, code, Redirect, verifier, Resource);
        Assert.Null(result.Error);
        return (client, result.Tokens!);
    }

    [Fact]
    public async Task Code_exchange_issues_tokens_and_stores_only_hashes()
    {
        var (_, tokens) = await ConnectAsync();

        Assert.StartsWith("pmp_at_", tokens.AccessToken);
        Assert.StartsWith("pmp_rt_", tokens.RefreshToken);
        Assert.Equal(3600, tokens.ExpiresIn);
        Assert.DoesNotContain(_db.OAuthTokens, t => t.Hash == tokens.AccessToken || t.Hash == tokens.RefreshToken);
        Assert.DoesNotContain(_db.OAuthAuthorizationCodes, c => c.CodeHash.StartsWith("pmp_"));

        var grant = await _svc.ValidateAccessTokenAsync(tokens.AccessToken, Resource);
        Assert.NotNull(grant);
        Assert.Equal("test@example.com", grant.UserEmail);
        Assert.Single(await _svc.ListConnectionsAsync());
    }

    [Fact]
    public async Task Code_reuse_fails_and_revokes_grant()
    {
        var (client, code, verifier) = await AuthorizeAsync();
        var first = await _svc.ExchangeCodeAsync(client, code, Redirect, verifier, Resource);

        var second = await _svc.ExchangeCodeAsync(client, code, Redirect, verifier, Resource);

        Assert.Equal("invalid_grant", second.Error);
        Assert.Null(await _svc.ValidateAccessTokenAsync(first.Tokens!.AccessToken, Resource));
    }

    [Fact]
    public async Task Exchange_rejects_mismatches()
    {
        var (client, code, verifier) = await AuthorizeAsync();
        var (other, _) = await _svc.RegisterAsync("Jiný", [Redirect], false);

        Assert.Equal("invalid_grant", (await _svc.ExchangeCodeAsync(client, code, Redirect, Pkce().verifier, Resource)).Error);
        Assert.Equal("invalid_grant", (await _svc.ExchangeCodeAsync(client, code, "http://localhost:4567/other", verifier, Resource)).Error);
        Assert.Equal("invalid_grant", (await _svc.ExchangeCodeAsync(client, code, null, verifier, Resource)).Error);
        Assert.Equal("invalid_grant", (await _svc.ExchangeCodeAsync(other, code, Redirect, verifier, Resource)).Error);
        Assert.Equal("invalid_target", (await _svc.ExchangeCodeAsync(client, code, Redirect, verifier, "https://evil.cz/mcp")).Error);

        // Po neúspěšných pokusech kód pořád platí
        Assert.Null((await _svc.ExchangeCodeAsync(client, code, Redirect, verifier, null)).Error);
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var (client, code, verifier) = await AuthorizeAsync();
        _clock.Advance(TimeSpan.FromMinutes(6));

        Assert.Equal("invalid_grant", (await _svc.ExchangeCodeAsync(client, code, Redirect, verifier, Resource)).Error);
    }

    [Fact]
    public async Task Refresh_rotates_and_detects_reuse_after_grace()
    {
        var (client, tokens) = await ConnectAsync();

        var rotated = await _svc.RefreshAsync(client, tokens.RefreshToken, Resource);
        Assert.Null(rotated.Error);
        Assert.NotEqual(tokens.RefreshToken, rotated.Tokens!.RefreshToken);

        // Souběžný refresh se starým tokenem v grace okně projde
        _clock.Advance(TimeSpan.FromSeconds(30));
        Assert.Null((await _svc.RefreshAsync(client, tokens.RefreshToken, Resource)).Error);

        // Po grace okně = podezření na únik → celý přístup se zruší
        _clock.Advance(TimeSpan.FromMinutes(2));
        Assert.Equal("invalid_grant", (await _svc.RefreshAsync(client, tokens.RefreshToken, Resource)).Error);
        Assert.Null(await _svc.ValidateAccessTokenAsync(rotated.Tokens.AccessToken, Resource));
        Assert.Equal("invalid_grant", (await _svc.RefreshAsync(client, rotated.Tokens.RefreshToken, Resource)).Error);
    }

    [Fact]
    public async Task Refresh_rejects_other_client_and_resource()
    {
        var (client, tokens) = await ConnectAsync();
        var (other, _) = await _svc.RegisterAsync("Jiný", [Redirect], false);

        Assert.Equal("invalid_grant", (await _svc.RefreshAsync(other, tokens.RefreshToken, Resource)).Error);
        Assert.Equal("invalid_target", (await _svc.RefreshAsync(client, tokens.RefreshToken, "https://evil.cz/mcp")).Error);
        Assert.Equal("invalid_grant", (await _svc.RefreshAsync(client, tokens.AccessToken, Resource)).Error);
    }

    [Fact]
    public async Task Access_token_expires_and_is_bound_to_resource()
    {
        var (_, tokens) = await ConnectAsync();

        Assert.Null(await _svc.ValidateAccessTokenAsync(tokens.AccessToken, "https://jiny.example.cz/mcp"));
        Assert.Null(await _svc.ValidateAccessTokenAsync(tokens.RefreshToken, Resource));

        _clock.Advance(TimeSpan.FromMinutes(61));
        Assert.Null(await _svc.ValidateAccessTokenAsync(tokens.AccessToken, Resource));
    }

    [Fact]
    public async Task Revoked_connection_stops_working()
    {
        var (client, tokens) = await ConnectAsync();
        var connection = Assert.Single(await _svc.ListConnectionsAsync());

        Assert.True(await _svc.RevokeGrantAsync(connection.Id));

        Assert.Null(await _svc.ValidateAccessTokenAsync(tokens.AccessToken, Resource));
        Assert.Equal("invalid_grant", (await _svc.RefreshAsync(client, tokens.RefreshToken, Resource)).Error);
        Assert.Empty(await _svc.ListConnectionsAsync());
    }

    [Fact]
    public async Task Confidential_client_needs_secret()
    {
        var (client, secret) = await _svc.RegisterAsync("claude.ai", ["https://claude.ai/api/mcp/auth_callback"], confidential: true);

        Assert.NotNull(secret);
        Assert.True(OAuthService.ClientAuthenticated(client, secret));
        Assert.False(OAuthService.ClientAuthenticated(client, "spatne"));
        Assert.False(OAuthService.ClientAuthenticated(client, null));
    }

    [Fact]
    public async Task Cleanup_removes_expired_and_abandoned()
    {
        var (_, tokens) = await ConnectAsync();           // živé připojení zůstane
        await _svc.RegisterAsync("Opuštěný", [Redirect], false);
        await AuthorizeAsync();                            // nevyměněný kód, klient bez přístupu

        _clock.Advance(TimeSpan.FromDays(2));
        var removed = await _svc.CleanupAsync();

        Assert.True(removed > 0);
        Assert.Empty(_db.OAuthAuthorizationCodes.Where(c => c.ConsumedAt == null));
        Assert.Single(_db.OAuthClients);
        Assert.Single(_db.OAuthGrants);
        Assert.DoesNotContain(_db.OAuthTokens, t => t.Kind == OAuthTokenKind.Access); // access token vypršel po hodině
        Assert.Single(_db.OAuthTokens, t => t.Kind == OAuthTokenKind.Refresh);
        Assert.Null(await _svc.ValidateAccessTokenAsync(tokens.AccessToken, Resource));

        // Po vypršení refresh tokenu zmizí i přístup; klient zůstane (Claude si pamatuje client_id)
        _clock.Advance(TimeSpan.FromDays(61));
        await _svc.CleanupAsync();
        Assert.Empty(_db.OAuthGrants);
        Assert.Single(_db.OAuthClients);
    }
}

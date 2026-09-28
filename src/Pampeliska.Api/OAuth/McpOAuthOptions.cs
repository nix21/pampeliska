namespace Pampeliska.Api.OAuth;

/// <summary>Nastavení OAuth serveru pro MCP (sekce <c>Mcp</c> v konfiguraci).</summary>
public class McpOAuthOptions
{
    /// <summary>Povolené redirect URI klientů (oddělené ; , nebo mezerou). Loopback řeší <see cref="AllowLoopbackRedirects"/>.</summary>
    public string AllowedRedirectUris { get; set; } =
        "https://claude.ai/api/mcp/auth_callback;https://claude.com/api/mcp/auth_callback";

    /// <summary>Povolit http://localhost / 127.0.0.1 / [::1] na libovolném portu (Claude Code, MCP Inspector).</summary>
    public bool AllowLoopbackRedirects { get; set; } = true;

    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 60;
    /// <summary>Jak dlouho po rotaci smí být starý refresh token použit znovu (souběžný refresh z více session).</summary>
    public int RefreshReuseGraceSeconds { get; set; } = 60;
    public int AuthorizationCodeMinutes { get; set; } = 5;

    public IReadOnlyList<string> RedirectUriList => AllowedRedirectUris
        .Split([';', ',', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

public static class OAuthDefaults
{
    public const string BearerScheme = "McpBearer";
    public const string McpPolicy = "Mcp";
    public const string ReadScope = "pampeliska.read";
    public const string WriteScope = "pampeliska.write";
    public static readonly string[] AllScopes = [ReadScope, WriteScope];
    public const string McpPath = "/mcp";
    public const string ClientIdClaim = "client_id";
    public const string GrantIdClaim = "grant_id";
    public const string ClientNameClaim = "client_name";

    /// <summary>Issuer / základ URL podle requestu (za Caddy díky ForwardedHeaders správné schéma a host).</summary>
    public static string BaseUrl(HttpRequest r) => $"{r.Scheme}://{r.Host}{r.PathBase}";

    /// <summary>Identifikátor chráněného zdroje (RFC 8707) – adresa MCP endpointu.</summary>
    public static string Resource(HttpRequest r) => BaseUrl(r) + McpPath;
}

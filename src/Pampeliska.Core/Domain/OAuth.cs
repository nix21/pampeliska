namespace Pampeliska.Core.Domain;

/// <summary>OAuth klient registrovaný přes Dynamic Client Registration (RFC 7591) – např. Claude Desktop nebo Claude Code.</summary>
public class OAuthClient
{
    public required string Id { get; set; }
    /// <summary>Název deklarovaný klientem (neověřený).</summary>
    public string Name { get; set; } = "";
    public List<string> RedirectUris { get; set; } = [];
    /// <summary>SHA-256 hash tajemství u důvěrných klientů, u veřejných (PKCE) null.</summary>
    public string? SecretHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    /// <summary>Kdy klient naposledy získal tokeny – registrace, které přístup nikdy nezískaly, se uklízejí.</summary>
    public DateTimeOffset? LastAuthorizedAt { get; set; }
}

/// <summary>Jednorázový autorizační kód (platí pár minut, v DB jen hash).</summary>
public class OAuthAuthorizationCode
{
    public int Id { get; set; }
    public required string CodeHash { get; set; }
    public required string ClientId { get; set; }
    public required string RedirectUri { get; set; }
    public required string CodeChallenge { get; set; }
    public required string Resource { get; set; }
    public required string Scope { get; set; }
    public required string UserEmail { get; set; }
    public string? UserName { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    /// <summary>Grant vzniklý výměnou kódu – při opakovaném použití kódu se zruší.</summary>
    public int? GrantId { get; set; }
}

/// <summary>Udělený přístup („připojení AI") – drží access a refresh tokeny, jde odvolat.</summary>
public class OAuthGrant
{
    public int Id { get; set; }
    public required string ClientId { get; set; }
    public OAuthClient? Client { get; set; }
    public required string UserEmail { get; set; }
    public string? UserName { get; set; }
    public required string Resource { get; set; }
    public required string Scope { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public List<OAuthToken> Tokens { get; set; } = [];
}

public enum OAuthTokenKind
{
    Access = 0,
    Refresh = 1,
}

public class OAuthToken
{
    public int Id { get; set; }
    public int GrantId { get; set; }
    public OAuthGrant? Grant { get; set; }
    public OAuthTokenKind Kind { get; set; }
    /// <summary>SHA-256 hash tokenu – samotný token se neukládá.</summary>
    public required string Hash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    /// <summary>Kdy byl refresh token vyměněn za nový pár (rotace).</summary>
    public DateTimeOffset? ConsumedAt { get; set; }
}

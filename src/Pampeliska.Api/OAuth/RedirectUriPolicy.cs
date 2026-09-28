namespace Pampeliska.Api.OAuth;

/// <summary>
/// Které redirect URI smí klient zaregistrovat a jak se porovnávají. Allowlist brání tomu, aby si cizí klient
/// přes otevřenou registraci nechal poslat autorizační kód na svůj server.
/// </summary>
public class RedirectUriPolicy(McpOAuthOptions options)
{
    public bool IsAllowed(string? uri)
    {
        if (string.IsNullOrWhiteSpace(uri) || uri.Length > 500) return false;
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var u)) return false;
        if (u.Fragment.Length > 0 || u.UserInfo.Length > 0) return false;
        if (options.RedirectUriList.Contains(uri, StringComparer.Ordinal)) return true;
        return options.AllowLoopbackRedirects && IsLoopback(u);
    }

    public static bool IsLoopback(Uri u) =>
        u.Scheme == Uri.UriSchemeHttp && u.Host is "localhost" or "127.0.0.1" or "[::1]";

    /// <summary>Přesná shoda; u loopbacku se ignoruje port (RFC 8252 §7.3 – nativní aplikace dostávají port dynamicky).</summary>
    public static bool Matches(string registered, string requested)
    {
        if (string.Equals(registered, requested, StringComparison.Ordinal)) return true;
        if (!Uri.TryCreate(registered, UriKind.Absolute, out var r) || !Uri.TryCreate(requested, UriKind.Absolute, out var q))
            return false;
        return IsLoopback(r) && IsLoopback(q) && q.Fragment.Length == 0 && q.UserInfo.Length == 0 &&
               string.Equals(r.Host, q.Host, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(r.PathAndQuery, q.PathAndQuery, StringComparison.Ordinal);
    }

    /// <summary>Host pro zobrazení uživateli (u loopbacku včetně portu).</summary>
    public static string DisplayHost(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var u) ? (IsLoopback(u) ? $"{u.Host}:{u.Port}" : u.Host) : uri;
}

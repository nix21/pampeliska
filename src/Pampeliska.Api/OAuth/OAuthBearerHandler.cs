using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Pampeliska.Api.OAuth;

/// <summary>
/// Ověření access tokenu vydaného vlastním OAuth serverem (jen hlavička Authorization: Bearer). Výzvu (401 s odkazem
/// na metadata chráněného zdroje) přeposílá MCP handleru ze SDK přes <c>ForwardChallenge</c>.
/// </summary>
public class OAuthBearerHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? header = Request.Headers.Authorization;
        if (header is null || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();
        var token = header["Bearer ".Length..].Trim();
        if (token.Length == 0) return AuthenticateResult.NoResult();

        var svc = Context.RequestServices.GetRequiredService<OAuthService>();
        var grant = await svc.ValidateAccessTokenAsync(token, OAuthDefaults.Resource(Request));
        if (grant is null) return AuthenticateResult.Fail("Neplatný nebo vypršelý access token.");

        var claims = new List<Claim>
        {
            new(ClaimTypes.Email, grant.UserEmail),
            new(OAuthDefaults.ClientIdClaim, grant.ClientId),
            new(OAuthDefaults.GrantIdClaim, grant.Id.ToString()),
            new("scope", grant.Scope),
        };
        if (grant.UserName is { Length: > 0 } name) claims.Add(new Claim(ClaimTypes.Name, name));
        if (grant.Client?.Name is { Length: > 0 } clientName) claims.Add(new Claim(OAuthDefaults.ClientNameClaim, clientName));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name));
        return AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name));
    }
}

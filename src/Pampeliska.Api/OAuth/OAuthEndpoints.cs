using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace Pampeliska.Api.OAuth;

/// <summary>Parametry autorizačního požadavku (GET z query, POST souhlasu z formuláře).</summary>
public record AuthorizeRequest(string? ClientId, string? RedirectUri, string? ResponseType, string? CodeChallenge,
    string? CodeChallengeMethod, string? State, string? Scope, string? Resource)
{
    public static AuthorizeRequest From(Func<string, string?> get) => new(get("client_id"), get("redirect_uri"),
        get("response_type"), get("code_challenge"), get("code_challenge_method"), get("state"), get("scope"), get("resource"));

    /// <summary>Pole pro skrytý formulář souhlasové stránky.</summary>
    public IEnumerable<(string Name, string Value)> Fields()
    {
        (string, string?)[] all =
        [
            ("client_id", ClientId), ("redirect_uri", RedirectUri), ("response_type", ResponseType), ("code_challenge", CodeChallenge),
            ("code_challenge_method", CodeChallengeMethod), ("state", State), ("scope", Scope), ("resource", Resource),
        ];
        return all.Where(f => f.Item2 is not null).Select(f => (f.Item1, f.Item2!));
    }
}

public record RegistrationRequest(
    [property: JsonPropertyName("redirect_uris")] List<string>? RedirectUris,
    [property: JsonPropertyName("client_name")] string? ClientName,
    [property: JsonPropertyName("token_endpoint_auth_method")] string? TokenEndpointAuthMethod);

/// <summary>
/// OAuth 2.1 autorizační server pro MCP (metadata RFC 8414 / 9728, DCR RFC 7591, PKCE, RFC 8707, revokace RFC 7009).
/// Přihlášení uživatele deleguje na stávající Google login (cookie) s allowlistem e-mailů.
/// </summary>
public static class OAuthEndpoints
{
    private static readonly string[] AuthMethods = ["none", "client_secret_post", "client_secret_basic"];

    public static void MapOAuthEndpoints(this WebApplication app)
    {
        app.MapGet("/.well-known/oauth-authorization-server", AuthorizationServerMetadata).AllowAnonymous();
        app.MapGet("/.well-known/oauth-authorization-server/mcp", AuthorizationServerMetadata).AllowAnonymous();
        app.MapGet("/.well-known/oauth-protected-resource", (HttpRequest r) => Results.Json(ProtectedResourceMetadata(r))).AllowAnonymous();

        // Jinak by na neznámé cesty odpovídal SPA fallback stránkou index.html (200) a mátl OAuth discovery klientů
        app.Map("/.well-known/{**rest}", () => Results.Json(new { error = "not_found" }, statusCode: 404)).AllowAnonymous();
        app.Map("/oauth/{**rest}", () => Results.Json(new { error = "not_found" }, statusCode: 404)).AllowAnonymous();

        app.MapPost("/oauth/register", Register).AllowAnonymous().RequireRateLimiting("oauth-register");
        app.MapGet("/oauth/authorize", AuthorizeGet).AllowAnonymous().RequireRateLimiting("oauth-authorize");
        app.MapPost("/oauth/authorize", AuthorizePost).AllowAnonymous().DisableAntiforgery().RequireRateLimiting("oauth-authorize");
        app.MapPost("/oauth/token", Token).AllowAnonymous().DisableAntiforgery().RequireRateLimiting("oauth-token");
        app.MapPost("/oauth/revoke", Revoke).AllowAnonymous().DisableAntiforgery().RequireRateLimiting("oauth-token");
    }

    /// <summary>Připojení AI v Nastavení webu (cookie login).</summary>
    public static void MapMcpConnectionEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/mcp/connections", (OAuthService svc) => svc.ListConnectionsAsync());
        api.MapDelete("/mcp/connections/{id:int}", async (int id, OAuthService svc) =>
            await svc.RevokeGrantAsync(id) ? Results.NoContent() : Results.NotFound());
    }

    public static object ProtectedResourceMetadata(HttpRequest r) => new
    {
        resource = OAuthDefaults.Resource(r),
        authorization_servers = new[] { OAuthDefaults.BaseUrl(r) },
        scopes_supported = OAuthDefaults.AllScopes,
        bearer_methods_supported = new[] { "header" },
        resource_name = "Pampeliška",
    };

    private static IResult AuthorizationServerMetadata(HttpRequest r)
    {
        var b = OAuthDefaults.BaseUrl(r);
        return Results.Json(new
        {
            issuer = b,
            authorization_endpoint = $"{b}/oauth/authorize",
            token_endpoint = $"{b}/oauth/token",
            registration_endpoint = $"{b}/oauth/register",
            revocation_endpoint = $"{b}/oauth/revoke",
            response_types_supported = new[] { "code" },
            response_modes_supported = new[] { "query" },
            grant_types_supported = new[] { "authorization_code", "refresh_token" },
            code_challenge_methods_supported = new[] { "S256" },
            token_endpoint_auth_methods_supported = AuthMethods,
            revocation_endpoint_auth_methods_supported = AuthMethods,
            scopes_supported = OAuthDefaults.AllScopes,
            authorization_response_iss_parameter_supported = true,
            client_id_metadata_document_supported = false,
        });
    }

    // ---------- Registrace klienta (RFC 7591) ----------

    private static async Task<IResult> Register(HttpContext ctx, OAuthService svc, IOptions<McpOAuthOptions> options, ILogger<OAuthService> log)
    {
        RegistrationRequest? req;
        try
        {
            req = await JsonSerializer.DeserializeAsync<RegistrationRequest>(ctx.Request.Body, cancellationToken: ctx.RequestAborted);
        }
        catch (JsonException)
        {
            return RegistrationError("invalid_client_metadata", "Tělo požadavku není platný JSON.");
        }
        if (req?.RedirectUris is not { Count: > 0 and <= 5 } uris)
            return RegistrationError("invalid_redirect_uri", "redirect_uris musí obsahovat 1–5 adres.");
        var policy = new RedirectUriPolicy(options.Value);
        if (uris.FirstOrDefault(u => !policy.IsAllowed(u)) is { } bad)
        {
            log.LogWarning("OAuth registrace odmítnuta, nepovolené redirect_uri {Uri} (klient {Name})", bad, req.ClientName);
            return RegistrationError("invalid_redirect_uri", $"redirect_uri {bad} není povolené.");
        }
        var method = req.TokenEndpointAuthMethod ?? "none";
        if (!AuthMethods.Contains(method))
            return RegistrationError("invalid_client_metadata", $"token_endpoint_auth_method {method} není podporovaná.");
        if (await svc.PendingClientCountAsync() >= OAuthService.MaxPendingClients)
            return RegistrationError("invalid_client_metadata", "Příliš mnoho nedokončených registrací, zkuste to později.");

        var (client, secret) = await svc.RegisterAsync(req.ClientName, uris, method != "none");
        log.LogInformation("OAuth klient zaregistrován: {ClientId} {Name} → {Redirects}", client.Id, client.Name, string.Join(", ", uris));
        return Results.Json(new
        {
            client_id = client.Id,
            client_id_issued_at = client.CreatedAt.ToUnixTimeSeconds(),
            client_secret = secret,
            client_secret_expires_at = secret is null ? (long?)null : 0,
            client_name = client.Name,
            redirect_uris = client.RedirectUris,
            grant_types = new[] { "authorization_code", "refresh_token" },
            response_types = new[] { "code" },
            token_endpoint_auth_method = method,
            scope = string.Join(' ', OAuthDefaults.AllScopes),
        }, statusCode: 201);
    }

    private static IResult RegistrationError(string error, string description) =>
        Results.Json(new { error, error_description = description }, statusCode: 400);

    // ---------- Autorizace a souhlas ----------

    private sealed record Validated(IResult? Failure, Core.Domain.OAuthClient? Client = null, string? Resource = null);

    /// <summary>
    /// Ověření autorizačního požadavku. Dokud není ověřený klient a jeho redirect_uri, chyby se ukazují jako stránka
    /// (nikdy nepřesměrovávat na neověřenou adresu); potom se vrací přesměrováním s <c>error</c> dle RFC 6749 §4.1.2.1.
    /// </summary>
    private static async Task<Validated> ValidateAsync(AuthorizeRequest r, HttpRequest http, OAuthService svc, McpOAuthOptions options)
    {
        var client = await svc.FindClientAsync(r.ClientId);
        if (client is null)
            return new(ConsentPage.Error("Neznámá aplikace (client_id). Registrace mohla vypršet nebo byla smazána."));
        if (r.RedirectUri is null || !client.RedirectUris.Any(u => RedirectUriPolicy.Matches(u, r.RedirectUri)) ||
            !new RedirectUriPolicy(options).IsAllowed(r.RedirectUri))
            return new(ConsentPage.Error("Adresa pro přesměrování (redirect_uri) neodpovídá registraci aplikace."));

        if (r.ResponseType != "code")
            return new(ErrorRedirect(r, http, "unsupported_response_type", "Podporováno je jen response_type=code."));
        if (!OAuthCrypto.IsValidChallenge(r.CodeChallenge) || r.CodeChallengeMethod != "S256")
            return new(ErrorRedirect(r, http, "invalid_request", "Vyžadováno PKCE s code_challenge_method=S256."));
        var resource = OAuthDefaults.Resource(http);
        if (r.Resource is not null && !OAuthService.SameResource(r.Resource, resource))
            return new(ErrorRedirect(r, http, "invalid_target", $"Neznámý resource, očekáváno {resource}."));
        return new(null, client, resource);
    }

    private static async Task<IResult> AuthorizeGet(HttpContext ctx, OAuthService svc, IOptions<McpOAuthOptions> options,
        MemberDirectory allowed, IAntiforgery antiforgery)
    {
        var r = AuthorizeRequest.From(k => ctx.Request.Query[k].FirstOrDefault());
        var v = await ValidateAsync(r, ctx.Request, svc, options.Value);
        if (v.Failure is not null) return v.Failure;

        if (ctx.User.Identity?.IsAuthenticated != true)
        {
            var back = ctx.Request.PathBase + ctx.Request.Path + ctx.Request.QueryString;
            return Results.Redirect("/auth/login?returnUrl=" + Uri.EscapeDataString(back));
        }
        var email = ctx.User.FindFirstValue(ClaimTypes.Email);
        if (!allowed.Contains(email))
            return ConsentPage.Error($"Účet {email} nemá do Pampelišky přístup.", 403);

        var tokens = antiforgery.GetAndStoreTokens(ctx);
        var wantsWrite = r.Scope is null || r.Scope.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(OAuthDefaults.WriteScope);
        return ConsentPage.Consent(r, v.Client!.Name, email!, wantsWrite, tokens.FormFieldName, tokens.RequestToken!);
    }

    private static async Task<IResult> AuthorizePost(HttpContext ctx, OAuthService svc, IOptions<McpOAuthOptions> options,
        MemberDirectory allowed, IAntiforgery antiforgery, ILogger<OAuthService> log)
    {
        if (!ctx.Request.HasFormContentType) return ConsentPage.Error("Neplatný požadavek.");
        try
        {
            await antiforgery.ValidateRequestAsync(ctx);
        }
        catch (AntiforgeryValidationException)
        {
            return ConsentPage.Error("Platnost formuláře vypršela. Spusťte připojení v Claude znovu.");
        }
        var email = ctx.User.FindFirstValue(ClaimTypes.Email);
        if (ctx.User.Identity?.IsAuthenticated != true || !allowed.Contains(email))
            return ConsentPage.Error("Nejste přihlášeni účtem s přístupem do Pampelišky.", 403);

        var form = await ctx.Request.ReadFormAsync();
        var r = AuthorizeRequest.From(k => form[k].FirstOrDefault());
        var v = await ValidateAsync(r, ctx.Request, svc, options.Value);
        if (v.Failure is not null) return v.Failure;

        if (form["decision"] != "allow")
        {
            log.LogInformation("OAuth: připojení klienta {ClientId} zamítnuto uživatelem", r.ClientId);
            return ErrorRedirect(r, ctx.Request, "access_denied", "Uživatel připojení zamítl.");
        }
        var scope = form["write"] == "on" ? string.Join(' ', OAuthDefaults.AllScopes) : OAuthDefaults.ReadScope;
        var code = await svc.CreateCodeAsync(v.Client!, r.RedirectUri!, r.CodeChallenge!, v.Resource!, email!, ctx.User.FindFirstValue(ClaimTypes.Name), scope);
        log.LogInformation("OAuth: {Email} povolil připojení klienta {ClientId} ({Name}), scope {Scope}", email, v.Client!.Id, v.Client.Name, scope);
        return Results.Redirect(QueryHelpers.AddQueryString(r.RedirectUri!, Params(ctx.Request, r.State, ("code", code))));
    }

    private static IResult ErrorRedirect(AuthorizeRequest r, HttpRequest http, string error, string description) =>
        Results.Redirect(QueryHelpers.AddQueryString(r.RedirectUri!, Params(http, r.State, ("error", error), ("error_description", description))));

    private static List<KeyValuePair<string, string?>> Params(HttpRequest http, string? state, params (string Key, string Value)[] values)
    {
        var list = values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)).ToList();
        if (state is not null) list.Add(new("state", state));
        list.Add(new("iss", OAuthDefaults.BaseUrl(http)));
        return list;
    }

    // ---------- Token a revokace ----------

    private static async Task<IResult> Token(HttpContext ctx, OAuthService svc)
    {
        ctx.Response.Headers.CacheControl = "no-store";
        ctx.Response.Headers.Pragma = "no-cache";
        if (!ctx.Request.HasFormContentType) return TokenError("invalid_request", "Očekáván application/x-www-form-urlencoded.");
        var form = await ctx.Request.ReadFormAsync();
        var (client, clientError) = await AuthenticateClientAsync(ctx, form, svc);
        if (client is null) return clientError!;

        var result = form["grant_type"].ToString() switch
        {
            "authorization_code" => await svc.ExchangeCodeAsync(client, form["code"].FirstOrDefault(), form["redirect_uri"].FirstOrDefault(),
                form["code_verifier"].FirstOrDefault(), form["resource"].FirstOrDefault()),
            "refresh_token" => await svc.RefreshAsync(client, form["refresh_token"].FirstOrDefault(), form["resource"].FirstOrDefault()),
            _ => TokenResult.Fail("unsupported_grant_type", "Podporováno je authorization_code a refresh_token."),
        };
        if (result.Tokens is not { } t) return TokenError(result.Error!, result.ErrorDescription);
        return Results.Json(new
        {
            access_token = t.AccessToken,
            token_type = "Bearer",
            expires_in = t.ExpiresIn,
            refresh_token = t.RefreshToken,
            scope = t.Scope,
        });
    }

    private static async Task<IResult> Revoke(HttpContext ctx, OAuthService svc)
    {
        if (!ctx.Request.HasFormContentType) return TokenError("invalid_request", "Očekáván application/x-www-form-urlencoded.");
        var form = await ctx.Request.ReadFormAsync();
        var (client, clientError) = await AuthenticateClientAsync(ctx, form, svc);
        if (client is null) return clientError!;
        await svc.RevokeTokenAsync(client, form["token"].FirstOrDefault());
        return Results.Ok();
    }

    /// <summary>Klient z hlavičky Basic (client_secret_basic) nebo z formuláře (client_secret_post / veřejný klient).</summary>
    private static async Task<(Core.Domain.OAuthClient?, IResult?)> AuthenticateClientAsync(HttpContext ctx, IFormCollection form, OAuthService svc)
    {
        string? id = form["client_id"].FirstOrDefault(), secret = form["client_secret"].FirstOrDefault();
        var basic = false;
        string? header = ctx.Request.Headers.Authorization;
        if (header is not null && header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header["Basic ".Length..].Trim()));
                var sep = decoded.IndexOf(':');
                if (sep > 0)
                {
                    id = Uri.UnescapeDataString(decoded[..sep]);
                    secret = Uri.UnescapeDataString(decoded[(sep + 1)..]);
                    basic = true;
                }
            }
            catch (FormatException) { }
        }
        var client = await svc.FindClientAsync(id);
        if (client is not null && OAuthService.ClientAuthenticated(client, secret)) return (client, null);
        if (basic) ctx.Response.Headers.WWWAuthenticate = "Basic realm=\"Pampeliska\"";
        return (null, TokenError("invalid_client", "Neznámý klient nebo chybné tajemství.", 401));
    }

    private static IResult TokenError(string error, string? description, int status = 400) =>
        Results.Json(new { error, error_description = description }, statusCode: status);
}

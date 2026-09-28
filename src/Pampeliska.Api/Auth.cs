using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Api.OAuth;
using Pampeliska.Core.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using ModelContextProtocol.AspNetCore.Authentication;
using ModelContextProtocol.Authentication;

namespace Pampeliska.Api;

/// <summary>
/// Přihlášení přes Google (OAuth). Přístup mají e-maily členů domácnosti (viz <see cref="MemberDirectory"/>).
/// V Development lze zapnout Auth:DevBypass pro lokální vývoj bez Google.
/// MCP endpoint (/mcp) místo cookie přijímá jen Bearer tokeny vlastního OAuth serveru (viz <see cref="OAuthEndpoints"/>).
/// </summary>
public static class Auth
{
    public static void AddPampeliskaAuth(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        builder.Services.AddSingleton<MemberDirectory>();
        var googleId = config["Auth:Google:ClientId"];
        var googleSecret = config["Auth:Google:ClientSecret"];

        var auth = builder.Services.AddAuthentication(o =>
            {
                o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddCookie(o =>
            {
                o.Cookie.Name = "pampeliska.auth";
                o.Cookie.HttpOnly = true;
                o.Cookie.SameSite = SameSiteMode.Lax;
                o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                o.ExpireTimeSpan = TimeSpan.FromDays(14);
                o.SlidingExpiration = true;
                // API vrací 401/403 místo přesměrování
                o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
                o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
            })
            // Access tokeny pro MCP; 401 s odkazem na metadata chráněného zdroje (RFC 9728) řeší handler z MCP SDK
            .AddScheme<AuthenticationSchemeOptions, OAuthBearerHandler>(OAuthDefaults.BearerScheme,
                o => o.ForwardChallenge = McpAuthenticationDefaults.AuthenticationScheme)
            .AddMcp(o => o.Events.OnResourceMetadataRequest = ctx =>
            {
                var r = ctx.HttpContext.Request;
                ctx.ResourceMetadata = new ProtectedResourceMetadata
                {
                    Resource = OAuthDefaults.Resource(r),
                    AuthorizationServers = [OAuthDefaults.BaseUrl(r)],
                    ScopesSupported = [.. OAuthDefaults.AllScopes],
                    BearerMethodsSupported = ["header"],
                    ResourceName = "Pampeliška",
                };
                return Task.CompletedTask;
            });

        if (!string.IsNullOrEmpty(googleId) && !string.IsNullOrEmpty(googleSecret))
        {
            auth.AddGoogle(o =>
            {
                o.ClientId = googleId;
                o.ClientSecret = googleSecret;
                o.Scope.Add("email");
                o.Events.OnTicketReceived = async ctx =>
                {
                    var directory = ctx.HttpContext.RequestServices.GetRequiredService<MemberDirectory>();
                    var email = ctx.Principal?.FindFirstValue(ClaimTypes.Email);
                    if (!directory.Contains(email))
                    {
                        ctx.Response.Redirect("/?error=forbidden");
                        ctx.HandleResponse();
                        return;
                    }
                    await directory.OnLoginAsync(email!, ctx.Principal?.FindFirstValue(ClaimTypes.Name));
                };
                o.Events.OnRemoteFailure = ctx =>
                {
                    ctx.Response.Redirect("/?error=login");
                    ctx.HandleResponse();
                    return Task.CompletedTask;
                };
            });
        }

        static bool Allowed(AuthorizationHandlerContext ctx) =>
            ctx.Resource is HttpContext http
                ? http.RequestServices.GetRequiredService<MemberDirectory>().Contains(ctx.User.FindFirstValue(ClaimTypes.Email))
                : false;

        builder.Services.AddAuthorizationBuilder()
            .SetFallbackPolicy(null)
            .SetDefaultPolicy(new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .RequireAssertion(Allowed)
                .Build())
            .AddPolicy(OAuthDefaults.McpPolicy, p => p
                .AddAuthenticationSchemes(OAuthDefaults.BearerScheme)
                .RequireAuthenticatedUser()
                .RequireAssertion(Allowed));
    }

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var devBypass = app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Auth:DevBypass");
        var directory = app.Services.GetRequiredService<MemberDirectory>();

        app.MapGet("/auth/login", async (HttpContext ctx, string? returnUrl) =>
        {
            var target = returnUrl is { Length: > 0 } r && r.StartsWith('/') && !r.StartsWith("//") && !r.StartsWith("/\\") ? r : "/";
            if (devBypass)
            {
                var email = ctx.Request.Query["email"].FirstOrDefault() is { Length: > 0 } q && directory.Contains(q)
                    ? q : directory.FirstOwner ?? "dev@localhost";
                var identity = new ClaimsIdentity([
                    new Claim(ClaimTypes.Email, email),
                    new Claim(ClaimTypes.Name, "Vývojář"),
                ], CookieAuthenticationDefaults.AuthenticationScheme);
                await directory.OnLoginAsync(email, "Vývojář");
                await ctx.SignInAsync(new ClaimsPrincipal(identity));
                return Results.Redirect(target);
            }
            return Results.Challenge(new AuthenticationProperties { RedirectUri = target }, [GoogleDefaults.AuthenticationScheme]);
        });

        app.MapPost("/auth/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok();
        });

        app.MapGet("/auth/me", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var email = user.FindFirstValue(ClaimTypes.Email);
            if (user.Identity?.IsAuthenticated != true || !directory.Contains(email)) return Results.Unauthorized();
            var lower = email!.ToLowerInvariant();
            var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Email == lower);
            return Results.Ok(new
            {
                email, name = user.FindFirstValue(ClaimTypes.Name), picture = user.FindFirstValue("urn:google:picture"),
                memberId = member?.Id, memberName = member?.Name, color = member?.ColorToken, role = member?.Role,
            });
        });
    }
}

using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Api;
using Pampeliska.Api.Endpoints;
using Pampeliska.Api.Mcp;
using Pampeliska.Api.OAuth;
using Pampeliska.Core;
using Pampeliska.Core.Data;
using Pampeliska.Core.Integrations;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Services.AddDbContext<AppDbContext>(o => o
    .UseNpgsql(config.GetConnectionString("Default"))
    .UseSnakeCaseNamingConvention());

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

var dataRoot = config["Storage:Root"] ?? Path.Combine(builder.Environment.ContentRootPath, "data");
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataRoot, "keys")))
    .SetApplicationName("Pampeliska");

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<DemoSeeder>();
builder.Services.AddPampeliskaCore();
builder.Services.AddHttpClient<CnbRates>(c => { c.BaseAddress = new Uri(CnbRates.BaseUrl); c.Timeout = TimeSpan.FromSeconds(15); });
builder.Services.AddMemoryCache();
if (config.GetValue("BackgroundJobs:Enabled", true))
{
    builder.Services.AddHostedService<FxRateSyncService>();
    builder.Services.AddHostedService<DailyChecksService>();
}

builder.AddPampeliskaAuth();

// MCP server (/mcp) s vlastním OAuth 2.1 autorizačním serverem (/oauth/*), přihlášení přes Google
builder.Services.Configure<McpOAuthOptions>(config.GetSection("Mcp"));
builder.Services.AddScoped<OAuthService>();
builder.Services.AddHostedService<OAuthCleanupService>();
builder.Services.AddAntiforgery(o =>
{
    o.Cookie.Name = "pampeliska.af";
    o.Cookie.SameSite = SameSiteMode.Strict;
});
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    static RateLimitPartition<string> PerIp(HttpContext ctx, int permits, TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = window });
    o.AddPolicy("oauth-register", ctx => PerIp(ctx, 10, TimeSpan.FromMinutes(10)));
    o.AddPolicy("oauth-authorize", ctx => PerIp(ctx, 30, TimeSpan.FromMinutes(1)));
    o.AddPolicy("oauth-token", ctx => PerIp(ctx, 60, TimeSpan.FromMinutes(1)));
});
// MCP Inspector při lokálním vývoji volá discovery a token endpoint z prohlížeče
builder.Services.AddCors(o => o.AddPolicy("mcp-dev", p => p
    .AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()
    .WithExposedHeaders("WWW-Authenticate", "Mcp-Session-Id", "Mcp-Protocol-Version")));
builder.Services.AddPampeliskaMcp();

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseMiddleware<DomainExceptionMiddleware>();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsRelational()) await db.Database.MigrateAsync();
    else await db.Database.EnsureCreatedAsync(); // testy nad InMemory
    await Seed.EnsureAsync(db);
}

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseDefaultFiles();
app.UseStaticFiles();
if (app.Environment.IsDevelopment())
    app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments("/.well-known") || ctx.Request.Path.StartsWithSegments("/oauth") ||
                       ctx.Request.Path.StartsWithSegments("/mcp"),
        b => b.UseCors("mcp-dev"));
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapOAuthEndpoints();
app.MapMcp(OAuthDefaults.McpPath).RequireAuthorization(OAuthDefaults.McpPolicy);
// Stateless MCP nemá GET (SSE stream) ani DELETE (session) – bez tohoto by odpověděl SPA fallback stránkou index.html
app.MapMethods(OAuthDefaults.McpPath, [HttpMethods.Get, HttpMethods.Delete], (HttpContext ctx) =>
{
    ctx.Response.Headers.Allow = HttpMethods.Post;
    return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
}).AllowAnonymous();

var api = app.MapGroup("/api").RequireAuthorization();
api.MapMcpConnectionEndpoints();
api.MapPampeliskaEndpoints();
app.MapBackupEndpoints();
if (app.Environment.IsDevelopment() || config.GetValue<bool>("Testing:Endpoints"))
    app.MapTestingEndpoints();

app.MapGet("/healthz", () => Results.Ok("ok")).AllowAnonymous();
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

public partial class Program;

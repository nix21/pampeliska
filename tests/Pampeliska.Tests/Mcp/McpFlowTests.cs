using System.Buffers.Text;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace Pampeliska.Tests.Mcp;

/// <summary>Aplikace nad InMemory DB, Development + DevBypass (přihlášení bez Google).</summary>
public class PampeliskaFactory : WebApplicationFactory<Program>
{
    private readonly InMemoryDatabaseRoot _root = new();
    private readonly string _dbName = Guid.NewGuid().ToString();
    private readonly string _storage = Path.Combine(Path.GetTempPath(), "pampeliska-tests", Guid.NewGuid().ToString());

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Storage:Root", _storage);
        builder.UseSetting("Auth:OwnerEmails", "test@example.com");
        builder.UseSetting("BackgroundJobs:Enabled", "false");
        builder.UseSetting("Auth:DevBypass", "true");
        builder.ConfigureTestServices(services =>
        {
            foreach (var d in services.Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>) ||
                                                  d.ServiceType == typeof(IDbContextOptionsConfiguration<AppDbContext>)).ToList())
                services.Remove(d);
            services.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(_dbName, _root));
        });
    }

    public AppDbContext Db() => Services.CreateScope().ServiceProvider.GetRequiredService<AppDbContext>();

    public HttpClient Browser() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { Directory.Delete(_storage, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }
}

public class McpFlowTests(PampeliskaFactory factory) : IClassFixture<PampeliskaFactory>
{
    private const string Redirect = "http://localhost:8765/callback";

    [Fact]
    public async Task Discovery_metadata()
    {
        var http = factory.CreateClient();

        var prm = await http.GetFromJsonAsync<JsonElement>("/.well-known/oauth-protected-resource/mcp");
        Assert.Equal("http://localhost/mcp", prm.GetProperty("resource").GetString());
        Assert.Equal("http://localhost", prm.GetProperty("authorization_servers")[0].GetString());

        var root = await http.GetFromJsonAsync<JsonElement>("/.well-known/oauth-protected-resource");
        Assert.Equal("http://localhost/mcp", root.GetProperty("resource").GetString());

        var asm = await http.GetFromJsonAsync<JsonElement>("/.well-known/oauth-authorization-server");
        Assert.Equal("http://localhost", asm.GetProperty("issuer").GetString());
        Assert.Equal("http://localhost/oauth/token", asm.GetProperty("token_endpoint").GetString());
        Assert.Equal("S256", asm.GetProperty("code_challenge_methods_supported")[0].GetString());

        var oidc = await http.GetAsync("/.well-known/openid-configuration");
        Assert.Equal(HttpStatusCode.NotFound, oidc.StatusCode);
        Assert.Equal("application/json", oidc.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Get_mcp_is_405_not_spa()
    {
        var res = await factory.CreateClient().GetAsync("/mcp");

        Assert.Equal(HttpStatusCode.MethodNotAllowed, res.StatusCode);
        Assert.NotEqual("text/html", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Mcp_without_token_returns_401_with_resource_metadata()
    {
        var res = await PostMcp(factory.CreateClient(), null);

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        var challenge = res.Headers.WwwAuthenticate.ToString();
        Assert.Contains("Bearer", challenge);
        Assert.Contains("resource_metadata=\"http://localhost/.well-known/oauth-protected-resource/mcp\"", challenge);
    }

    [Fact]
    public async Task Mcp_rejects_cookie_login_and_invalid_token()
    {
        var browser = factory.Browser();
        await browser.GetAsync("/auth/login");
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/auth/me")).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await PostMcp(browser, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await PostMcp(factory.CreateClient(), "pmp_at_neexistuje")).StatusCode);
    }

    [Fact]
    public async Task Registration_rejects_foreign_redirect()
    {
        var res = await factory.CreateClient().PostAsJsonAsync("/oauth/register",
            new { client_name = "Zlý", redirect_uris = new[] { "https://evil.com/callback" } });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("invalid_redirect_uri", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Authorize_with_unknown_client_shows_error_page_without_redirect()
    {
        var res = await factory.Browser().GetAsync($"/oauth/authorize?client_id=pmp_c_x&redirect_uri={Uri.EscapeDataString(Redirect)}&response_type=code");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("text/html", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Consent_deny_redirects_with_access_denied()
    {
        var browser = factory.Browser();
        var clientId = await Register(browser);
        var (_, challenge) = Pkce();
        var consent = await OpenConsent(browser, clientId, challenge);

        var res = await browser.PostAsync("/oauth/authorize", new FormUrlEncodedContent(ConsentForm(consent, "deny")));

        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        var query = QueryHelpers.ParseQuery(res.Headers.Location!.Query);
        Assert.Equal("access_denied", query["error"]);
        Assert.Equal("xyz", query["state"]);
    }

    [Fact]
    public async Task Full_oauth_flow_and_tools()
    {
        var browser = factory.Browser();
        var clientId = await Register(browser);
        var (accessToken, verifierUsed) = await Connect(browser, clientId, write: true);
        Assert.NotEmpty(verifierUsed);

        // Připojení je vidět v Nastavení
        var connections = await browser.GetFromJsonAsync<JsonElement>("/api/mcp/connections");
        Assert.Contains(connections.EnumerateArray(), c => c.GetProperty("clientName").GetString() == "Test klient");

        await using var mcp = await Client(accessToken);
        var tools = (await mcp.ListToolsAsync()).Select(t => t.Name).ToList();
        Assert.Contains("get_household", tools);

        var household = await Call(mcp, "get_household", new());
        Assert.Equal("CZK", household.GetProperty("baseCurrency").GetString());
        Assert.Contains(household.GetProperty("members").EnumerateArray(), m => m.GetProperty("email").GetString() == "test@example.com");

        // Účet → import výpisu → fronta → kategorie → návrh AI (nad prahem se potvrdí)
        Assert.Contains("import_transactions", tools);
        var account = await Call(mcp, "create_account", new()
        {
            ["account"] = new { name = "Běžný účet", kind = "Current", institutionKey = "fio", accountNumber = "2900111222/2010", currency = "CZK", joint = true },
        });
        var accountId = account.GetProperty("id").GetInt32();
        var imported = await Call(mcp, "import_transactions", new()
        {
            ["accountId"] = accountId,
            ["transactions"] = new object[]
            {
                new { date = "2026-09-20", amount = -1124.5m, counterparty = "LIDL DEKUJE ZA NAKUP", paymentType = "Card" },
                new { date = "2026-09-21", amount = -329m, counterparty = "NETFLIX.COM" },
            },
            ["note"] = "Výpis 09/2026",
        });
        Assert.Equal(2, imported.GetProperty("created").GetInt32());
        var again = await Call(mcp, "import_transactions", new()
        {
            ["accountId"] = accountId,
            ["transactions"] = new object[] { new { date = "2026-09-20", amount = -1124.5m, counterparty = "LIDL DEKUJE ZA NAKUP" } },
        });
        Assert.Equal(1, again.GetProperty("skippedDuplicates").GetInt32());

        var queue = await Call(mcp, "get_categorization_queue", new());
        Assert.Equal(2, queue.GetArrayLength());
        var food = await Call(mcp, "create_category", new() { ["name"] = "Jídlo", ["color"] = "c2", ["need"] = "Need" });
        var shops = await Call(mcp, "create_category", new() { ["name"] = "Supermarkety", ["parentId"] = food.GetProperty("id").GetInt32() });
        var lidlId = queue.EnumerateArray().First(q => q.GetProperty("counterparty").GetString()!.StartsWith("LIDL")).GetProperty("id").GetInt32();
        var suggested = await Call(mcp, "suggest_categories", new()
        {
            ["suggestions"] = new object[] { new { transactionId = lidlId, categoryId = shops.GetProperty("id").GetInt32(), confidence = 95, reason = "Supermarket" } },
        });
        Assert.Equal(1, suggested.GetProperty("autoConfirmed").GetInt32());
        var remaining = await Call(mcp, "get_categorization_queue", new());
        Assert.Equal(1, remaining.GetArrayLength());

        // Poznámky ke kategorizaci – sdílená paměť, navázané se připojí k položce fronty
        var note = await Call(mcp, "add_note", new() { ["text"] = "Netflix platí Míša, patří do Předplatného", ["merchant"] = "netflix" });
        Assert.StartsWith("Test klient (", note.GetProperty("createdBy").GetString());
        var noteId = note.GetProperty("id").GetInt32();
        var withNote = await Call(mcp, "get_categorization_queue", new());
        Assert.Equal(noteId, withNote[0].GetProperty("notes")[0].GetProperty("id").GetInt32());
        var updated = await Call(mcp, "update_note", new() { ["noteId"] = noteId, ["text"] = "Netflix = Předplatné", ["merchant"] = "" });
        Assert.False(updated.TryGetProperty("merchantPattern", out _));
        Assert.Equal("Netflix = Předplatné", (await Call(mcp, "list_notes", new() { ["search"] = "predplatne" }))[0].GetProperty("text").GetString());
        Assert.False((await mcp.CallToolAsync("delete_note", new Dictionary<string, object?> { ["noteId"] = noteId })).IsError ?? false);
        Assert.Equal(0, (await Call(mcp, "list_notes", new())).GetArrayLength());
        var summary = await Call(mcp, "get_summary", new() { ["period"] = "2026-09" });
        Assert.Equal(1453.5m, summary.GetProperty("expense").GetDecimal());

        // Odpojení v Nastavení → token přestane platit
        var connectionId = connections.EnumerateArray().First(c => c.GetProperty("clientName").GetString() == "Test klient").GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.DeleteAsync($"/api/mcp/connections/{connectionId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await PostMcp(factory.CreateClient(), accessToken)).StatusCode);
    }

    [Fact]
    public async Task Read_only_grant_cannot_call_write_tools()
    {
        var browser = factory.Browser();
        var clientId = await Register(browser);
        var (accessToken, _) = await Connect(browser, clientId, write: false);
        await using var mcp = await Client(accessToken);

        var tools = await mcp.ListToolsAsync();
        var writeTool = tools.FirstOrDefault(t => t.ProtocolTool.Annotations?.ReadOnlyHint != true);
        Assert.NotNull(writeTool);
        var res = await mcp.CallToolAsync(writeTool.Name, new Dictionary<string, object?>());
        Assert.True(res.IsError);
        Assert.Contains("jen oprávnění ke čtení", Text(res));

        // Poznámky jde číst, ale ne ukládat
        Assert.Equal(0, (await Call(mcp, "list_notes", new())).GetArrayLength());
        var add = await mcp.CallToolAsync("add_note", new Dictionary<string, object?> { ["text"] = "x" });
        Assert.True(add.IsError);
    }

    /// <summary>Souhlas → kód → tokeny. Vrací access token.</summary>
    internal async Task<(string AccessToken, string Verifier)> Connect(HttpClient browser, string clientId, bool write)
    {
        var (verifier, challenge) = Pkce();
        var consent = await OpenConsent(browser, clientId, challenge);
        Assert.Contains("localhost:8765", consent);
        var form = ConsentForm(consent, "allow");
        if (write) form["write"] = "on";
        var allow = await browser.PostAsync("/oauth/authorize", new FormUrlEncodedContent(form));
        Assert.Equal(HttpStatusCode.Redirect, allow.StatusCode);
        var location = allow.Headers.Location!;
        Assert.StartsWith(Redirect, location.ToString());
        var query = QueryHelpers.ParseQuery(location.Query);
        Assert.Equal("xyz", query["state"]);
        Assert.Equal("http://localhost", query["iss"]);

        var tokenRes = await factory.CreateClient().PostAsync("/oauth/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code", ["code"] = query["code"]!, ["redirect_uri"] = Redirect,
            ["code_verifier"] = verifier, ["client_id"] = clientId, ["resource"] = "http://localhost/mcp",
        }));
        Assert.Equal(HttpStatusCode.OK, tokenRes.StatusCode);
        var tokens = await tokenRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(write ? "pampeliska.read pampeliska.write" : "pampeliska.read", tokens.GetProperty("scope").GetString());

        var refreshRes = await factory.CreateClient().PostAsync("/oauth/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token", ["refresh_token"] = tokens.GetProperty("refresh_token").GetString()!, ["client_id"] = clientId,
        }));
        Assert.Equal(HttpStatusCode.OK, refreshRes.StatusCode);
        var refreshed = await refreshRes.Content.ReadFromJsonAsync<JsonElement>();
        return (refreshed.GetProperty("access_token").GetString()!, verifier);
    }

    internal async Task<McpClient> Client(string accessToken) =>
        await McpClient.CreateAsync(new HttpClientTransport(new HttpClientTransportOptions
        {
            Endpoint = new Uri("http://localhost/mcp"),
            AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = $"Bearer {accessToken}" },
        }, factory.CreateClient(), ownsHttpClient: true));

    // ---------- pomocné ----------

    internal static async Task<JsonElement> Call(McpClient mcp, string tool, Dictionary<string, object?> args)
    {
        var result = await mcp.CallToolAsync(tool, args);
        Assert.False(result.IsError ?? false, Text(result));
        return JsonDocument.Parse(Text(result)).RootElement;
    }

    internal static string Text(CallToolResult result) =>
        string.Concat(result.Content.OfType<TextContentBlock>().Select(c => c.Text));

    private static Task<HttpResponseMessage> PostMcp(HttpClient http, string? token)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/mcp")
        {
            Content = new StringContent("""{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}""", Encoding.UTF8, "application/json"),
        };
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        if (token is not null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http.SendAsync(req);
    }

    private static (string verifier, string challenge) Pkce()
    {
        var verifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        return (verifier, Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))));
    }

    internal static async Task<string> Register(HttpClient http)
    {
        var res = await http.PostAsJsonAsync("/oauth/register", new { client_name = "Test klient", redirect_uris = new[] { Redirect } });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("client_id").GetString()!;
    }

    /// <summary>GET /oauth/authorize → přihlášení (DevBypass) → zpět na souhlasovou stránku; vrací její HTML.</summary>
    private static async Task<string> OpenConsent(HttpClient browser, string clientId, string challenge)
    {
        var url = QueryHelpers.AddQueryString("/oauth/authorize", new Dictionary<string, string?>
        {
            ["client_id"] = clientId, ["redirect_uri"] = Redirect, ["response_type"] = "code", ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256", ["state"] = "xyz", ["resource"] = "http://localhost/mcp", ["scope"] = "pampeliska.read pampeliska.write",
        });
        var res = await browser.GetAsync(url);
        for (var i = 0; i < 3 && res.StatusCode == HttpStatusCode.Redirect; i++)
            res = await browser.GetAsync(res.Headers.Location!.OriginalString);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("frame-ancestors 'none'", res.Headers.GetValues("Content-Security-Policy").Single());
        return await res.Content.ReadAsStringAsync();
    }

    private static Dictionary<string, string> ConsentForm(string html, string decision)
    {
        var form = Regex.Matches(html, """<input type="hidden" name="([^"]+)" value="([^"]*)">""")
            .ToDictionary(m => m.Groups[1].Value, m => WebUtility.HtmlDecode(m.Groups[2].Value));
        form["decision"] = decision;
        return form;
    }
}

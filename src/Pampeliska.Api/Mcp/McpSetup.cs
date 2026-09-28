using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Pampeliska.Api.OAuth;
using Pampeliska.Core.Domain;

namespace Pampeliska.Api.Mcp;

public static class McpSetup
{
    /// <summary>Výchozí JSON nastavení MCP SDK + výčty jako řetězce.</summary>
    public static readonly JsonSerializerOptions JsonOptions = new(McpJsonUtilities.DefaultOptions)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private const string Instructions = """
        Pampeliška je aplikace na rodinné finance jedné domácnosti s více členy (účty, pohyby, kategorie, pravidla,
        rozpočty, pravidelné platby, investice). Částky jsou v měně účtu, souhrny v Kč (kurz ČNB). Záporná částka = odchozí.

        Import výpisu (uživatel ti dá PDF/CSV výpis nebo text z bankovnictví):
        1. list_accounts – najdi účet podle banky a čísla účtu. Když chybí, zeptej se uživatele a založ ho přes create_account.
        2. Výpis sám rozparsuj a pošli pohyby přes import_transactions (pro každý účet zvlášť, klidně po dávkách do 500 pohybů).
           Vyplň date, amount (se znaménkem, v měně účtu), counterparty (obchodník / protistrana), message, raw_text (původní text řádku),
           counterparty_account, time a payment_type (Card u platby kartou – důležité pro podmínky účtů), external_id jen když ho výpis má.
           Duplicity server pozná sám, opakovaný import stejného výpisu nevadí.
        3. get_categorization_queue – nezařazené a nepotvrzené pohyby i s podobnými dřív zařazenými pohyby.
           list_categories a list_rules ti dají strom kategorií a pravidla.
        4. suggest_categories – navrhni kategorii (případně rozdělení) s jistotou 0–100 a krátkým důvodem česky.
           Návrhy s jistotou nad prahem domácnosti se potvrdí samy, ostatní čekají na uživatele ve frontě Ke kategorizaci.
        5. U obchodníků, kteří se opakují, navrhni uživateli pravidlo (create_rule) – vyhodnocují se shora dolů, platí první shoda.

        Důležité:
        - Před založením, přejmenováním, sloučením nebo smazáním kategorie či pravidla a před přímým potvrzením
          (categorize_transactions s confirm=true, confirm_transactions) shrň uživateli změny a počkej na souhlas.
        - Převody mezi vlastními účty se párují automaticky a nekategorizují se. Když pár chybí, použij link_transfer.
        - Mazat účty ani pohyby přes MCP nejde, stejně jako měnit nastavení domácnosti.
        - Když nástroj skončí chybou, nevolej ho naslepo znovu – nejdřív ověř stav čtecím nástrojem.
        """;

    public static void AddPampeliskaMcp(this IServiceCollection services)
    {
        services.AddMcpServer(o =>
            {
                o.ServerInfo = new() { Name = "pampeliska", Title = "Pampeliška", Version = "1.0.0" };
                o.ServerInstructions = Instructions;
            })
            .WithHttpTransport(o => o.Stateless = true)
            .AddAuthorizationFilters()
            .WithTools<HouseholdTools>(JsonOptions)
            .WithTools<TransactionTools>(JsonOptions)
            .WithTools<CategoryTools>(JsonOptions)
            .WithTools<PlanningTools>(JsonOptions)
            .WithRequestFilters(f => f.AddCallToolFilter(next => async (request, ct) =>
            {
                var services = request.Services!;
                var user = services.GetRequiredService<IHttpContextAccessor>().HttpContext?.User;
                var readOnly = (request.MatchedPrimitive as McpServerTool)?.ProtocolTool.Annotations?.ReadOnlyHint == true;
                var scopes = (user?.FindFirstValue("scope") ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
                services.GetRequiredService<ILogger<HouseholdTools>>().LogInformation("MCP {Tool} ({Email}, klient {ClientId})",
                    request.Params?.Name, user?.FindFirstValue(ClaimTypes.Email), user?.FindFirstValue(OAuthDefaults.ClientIdClaim));
                if (!readOnly && !scopes.Contains(OAuthDefaults.WriteScope))
                    throw new McpException("Připojení má jen oprávnění ke čtení. Pro zápis ho v Nastavení odeber a připoj znovu s povoleným zápisem.");
                return await next(request, ct);
            }));
    }

    /// <summary>Doménové chyby (česky, pro uživatele) předá modelu jako chybu nástroje.</summary>
    public static async Task<T> Guard<T>(Func<Task<T>> body)
    {
        try
        {
            return await body();
        }
        catch (DomainException e)
        {
            throw new McpException(e.Message);
        }
    }
}

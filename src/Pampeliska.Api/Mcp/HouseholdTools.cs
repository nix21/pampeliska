using System.ComponentModel;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Server;
using Pampeliska.Core;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Domácnost, účty a souhrny.</summary>
[McpServerToolType]
public class HouseholdTools(AppDbContext db, FxService fx, AccountQueries accountQueries, AccountService accounts, StatsService stats, CurrentUser user,
    TimeProvider time)
{
    public record MemberInfo(int Id, string Name, string Email, string Role, string Status);
    public record HouseholdInfo(string Name, string BaseCurrency, IReadOnlyList<MemberInfo> Members, HouseholdSettings Settings,
        IReadOnlyDictionary<string, decimal> Rates, string Today, string? CurrentMember);

    [McpServerTool(Name = "get_household", Title = "Domácnost", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Domácnost: členové (id pro podíly a pravidla), nastavení (práh automatického potvrzení AI, okno deduplikace), " +
                 "aktuální kurzy ČNB, dnešní datum a kdo je přihlášený.")]
    public Task<HouseholdInfo> GetHousehold() => McpSetup.Guard(async () =>
    {
        var h = await db.Households.AsNoTracking().FirstAsync();
        var members = await db.Members.AsNoTracking().OrderBy(m => m.SortOrder).ToListAsync();
        var today = time.Today();
        return new HouseholdInfo(h.Name, h.BaseCurrency,
            members.Select(m => new MemberInfo(m.Id, m.Name, m.Email, m.Role.ToString(), m.Status.ToString())).ToList(),
            h.Settings, await fx.LatestAsync(today), today.ToString("yyyy-MM-dd"), (await user.MemberAsync())?.Name);
    });

    public record AccountInfo(int Id, string Name, string Kind, string Institution, string InstitutionKey, string? AccountNumber, string Currency,
        string Owner, IReadOnlyList<ShareDto> Ratio, decimal Balance, decimal BalanceCzk, decimal? LowBalanceLimit, bool IncludeInDisposable,
        string Source, int TransactionCount, DateTimeOffset? LastImportAt, bool Archived);

    [McpServerTool(Name = "list_accounts", Title = "Účty", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Účty domácnosti: id, banka, číslo účtu, měna, vlastník (nebo společný s poměrem), zůstatek. Podle čísla účtu a banky " +
                 "vyber účet pro import_transactions.")]
    public Task<List<AccountInfo>> ListAccounts([Description("Včetně archivovaných.")] bool includeArchived = false) => McpSetup.Guard(async () =>
    {
        var members = await db.Members.AsNoTracking().ToDictionaryAsync(m => m.Id, m => m.Name);
        return (await accountQueries.ListAsync(includeArchived, sparklines: false)).Select(a => new AccountInfo(a.Id, a.Name, a.Kind.ToString(),
            a.Institution.Name, a.Institution.Key, a.Iban, a.Currency, a.Joint ? "společný" : members.GetValueOrDefault(a.OwnerMemberId ?? 0) ?? "?",
            a.Ratio, a.Balance, a.BalanceCzk, a.LowBalanceLimit, a.IncludeInDisposable, a.Source.ToString(), a.TransactionCount, a.LastImportAt,
            a.Archived)).ToList();
    });

    [McpServerTool(Name = "get_account", Title = "Detail účtu", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Detail účtu včetně podmínek banky, poměru společného účtu, počátečního zůstatku a řady zůstatků za 13 týdnů.")]
    public Task<AccountSummary> GetAccount([Description("Id účtu.")] int accountId) => McpSetup.Guard(() => accountQueries.GetAsync(accountId));

    [McpServerTool(Name = "list_institutions", Title = "Banky a instituce", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Číselník bank a investičních společností (klíč pro create_account).")]
    public Task<List<InstitutionDto>> ListInstitutions() => McpSetup.Guard(accountQueries.InstitutionsAsync);

    public class AccountArgs
    {
        [Description("Název účtu, např. „Běžný účet“.")] public string? Name { get; set; }
        [Description("Current (běžný), Savings (spořicí), Investment (investiční). Jen při založení.")] public AccountKind? Kind { get; set; }
        [Description("Klíč instituce z list_institutions (cs, fio, rb, ab, kb, csob, mb, pb, rev, oth, xtb…).")] public string? InstitutionKey { get; set; }
        [Description("Číslo účtu nebo IBAN (důležité pro párování převodů).")] public string? AccountNumber { get; set; }
        [Description("CZK, EUR nebo USD. Jen při založení.")] public string? Currency { get; set; }
        [Description("Id člena – vlastníka; nevyplň u společného účtu.")] public int? OwnerMemberId { get; set; }
        [Description("Společný účet.")] public bool? Joint { get; set; }
        [Description("Poměr společného účtu: id člena → procenta (součet 100).")] public Dictionary<int, decimal>? Ratio { get; set; }
        [Description("Počáteční zůstatek (k datu openingDate).")] public decimal? OpeningBalance { get; set; }
        [Description("Datum počátečního zůstatku (YYYY-MM-DD).")] public DateOnly? OpeningDate { get; set; }
        [Description("Limit pro hlídání nízkého zůstatku.")] public decimal? LowBalanceLimit { get; set; }
        [Description("Úroková sazba % p. a. (spořicí).")] public decimal? InterestRate { get; set; }
        [Description("Započítávat do disponibilního zůstatku.")] public bool? IncludeInDisposable { get; set; }
    }

    private static AccountInput Input(AccountArgs a) => new(a.Kind, a.InstitutionKey, a.Name, a.AccountNumber, a.Currency, a.OwnerMemberId, a.Joint, a.Ratio,
        LowBalanceLimit: a.LowBalanceLimit, InterestRate: a.InterestRate, IncludeInDisposable: a.IncludeInDisposable, OpeningBalance: a.OpeningBalance,
        OpeningDate: a.OpeningDate);

    [McpServerTool(Name = "create_account", Title = "Založit účet", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Založí účet (zdroj pohybů = MCP). Nejdřív se ujisti u uživatele o vlastníkovi a počátečním zůstatku.")]
    public Task<object> CreateAccount([Description("Údaje účtu.")] AccountArgs account) => McpSetup.Guard(async () =>
    {
        var a = await accounts.CreateAsync(Input(account) with { Source = AccountSource.Mcp });
        return (object)new { a.Id, a.Name };
    });

    [McpServerTool(Name = "update_account", Title = "Upravit účet", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Upraví účet (název, číslo, vlastník, poměr – nový poměr platí pro nové platby, limit…). Typ a měnu účtu s pohyby změnit nejde.")]
    public Task<string> UpdateAccount([Description("Id účtu.")] int accountId, [Description("Změny (vynechané se nemění).")] AccountArgs changes) =>
        McpSetup.Guard(async () => { await accounts.UpdateAsync(accountId, Input(changes)); return "Uloženo."; });

    [McpServerTool(Name = "add_balance_correction", Title = "Korekce zůstatku", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Srovná evidenci se skutečným zůstatkem k datu (zvláštní pohyb mimo statistiky). Použij, když výpis uvádí konečný zůstatek, který nesedí.")]
    public Task<object> AddCorrection([Description("Id účtu.")] int accountId, [Description("Datum (YYYY-MM-DD).")] DateOnly date,
        [Description("Skutečný zůstatek podle banky.")] decimal actualBalance) => McpSetup.Guard(async () =>
    {
        var t = await accounts.AddCorrectionAsync(accountId, date, actualBalance, await user.ActorAsync());
        return (object)new { t.Id, difference = t.Amount };
    });

    [McpServerTool(Name = "get_summary", Title = "Souhrn", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Příjmy, výdaje, bilance a míra úspor za období, rozpad podle kategorií (včetně podkategorií), nezbytné / pro radost a " +
                 "největší obchodníci. Převody, korekce, vyřazené pohyby a platby ve vyřazených kategoriích se nepočítají; u člena jen jeho podíl.")]
    public Task<OverviewStats> GetSummary(
        [Description("Období: 2026-09, 2026-Q3, 2026 nebo 2026-01-01..2026-06-30.")] string period,
        [Description("Id člena (volitelné).")] int? memberId = null,
        [Description("Jen potvrzené pohyby.")] bool confirmedOnly = false,
        [Description("Porovnat s předchozím obdobím.")] bool compare = true) =>
        McpSetup.Guard(() => stats.OverviewAsync(new StatsFilter(DateRange.Parse(period), memberId, confirmedOnly), compare));

    [McpServerTool(Name = "get_spending_by_month", Title = "Výdaje po měsících", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Po měsících: příjmy, výdaje, nezbytné/radost a výdaje podle hlavních kategorií (klíč = id kategorie, 0 = nezařazené).")]
    public Task<ExpenseTree> GetSpendingByMonth([Description("Období (např. 2026 nebo 2026-01-01..2026-09-30).")] string period,
        [Description("Id člena.")] int? memberId = null) =>
        McpSetup.Guard(() => stats.ExpensesAsync(new StatsFilter(DateRange.Parse(period), memberId), compare: false));
}

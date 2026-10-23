using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

// ---------- Scénář (ukládá se jako JSON v ForecastScenario) ----------

/// <summary>Položka <paramref name="Key"/> má od měsíce <paramref name="From"/> (do <paramref name="To"/>, null = dál) částku za domácnost v Kč/měsíc.</summary>
public record ScenarioChange(string Id, string Key, string From, string? To, decimal Amount);

/// <summary>Nová pravidelná platba ve scénáři od měsíce (Kč/měsíc, záporná = výdaj).</summary>
public record ScenarioRecurring(string Id, string Name, decimal Amount, string From, int? MemberId = null);

public record ScenarioOneOff(string Id, string Month, string Name, decimal Amount, int? MemberId = null);

/// <param name="Skips">Vynechané očekávané jednorázové platby (<see cref="PredOneOff.Key"/>).</param>
public record Scenario(IReadOnlyList<ScenarioChange>? Changes = null, IReadOnlyList<ScenarioRecurring>? Added = null,
    IReadOnlyList<ScenarioOneOff>? OneOffs = null, IReadOnlyList<string>? Skips = null);

// ---------- Výstup ----------

/// <param name="Sign">+1 příjem, −1 výdaj (podle kategorie / částky).</param>
/// <param name="Share">Podíl člena na částce domácnosti (1 za domácnost) – úprava v pohledu člena se ukládá jako hodnota / podíl.</param>
/// <param name="Base">Výchozí částka po měsících (aktuální měsíc = jen zbytek do konce měsíce).</param>
/// <param name="Value">Částka po měsících se scénářem.</param>
public record PredLeaf(string Note, int Sign, decimal Share, IReadOnlyList<decimal> Base, IReadOnlyList<decimal> Value);

/// <summary>Uzel stromu položek: skupina / kategorie (Children) nebo list (Leaf). Klíč listu = klíč úprav scénáře.</summary>
public record PredNode(string Key, string Name, string Color, IReadOnlyList<PredNode>? Children, PredLeaf? Leaf);

public record PredMonth(string Month, decimal Income, decimal Expense, decimal Balance, decimal BaseIncome, decimal BaseExpense, decimal BaseBalance,
    decimal Sigma);

/// <param name="Kind">Recurring (čtvrtletní/roční pravidelná platba), Expected (očekávaná), Scenario (přidaná ve scénáři).</param>
/// <param name="TopKey">Skupina pro porovnání se skutečností (c{id hlavní kategorie}, u, x, o).</param>
public record PredOneOff(string Key, string Month, string Name, decimal Amount, string Source, string Kind, bool Skipped, string TopKey);

public record PlanOne(string Name, decimal Amount);

/// <summary>Měsíc plánu nebo skutečnosti. Cats = hlavní kategorie (c{id}), u = nezařazené, x = převody, n = nové pravidelné, o = jednorázové.</summary>
public record PlanMonth(string Month, decimal Income, decimal Expense, decimal Balance, IReadOnlyDictionary<string, decimal> Cats, IReadOnlyList<PlanOne> Ones);

public record SnapshotPlan(decimal Start, IReadOnlyList<PlanMonth> Months);

public record SnapshotDto(int Id, string Name, DateOnly SavedOn, int Horizon, string CreatedBy, SnapshotPlan? Plan);

public record TopGroup(string Key, string Name, string Color);

public record ExpectedPaymentDto(int Id, string Name, string Month, decimal Amount, bool Yearly, int? MemberId, string? Note, string CreatedBy);

public record ExpectedPaymentInput(string? Name, string? Month, decimal Amount, bool Yearly = false, int? MemberId = null, string? Note = null);

/// <param name="DataMonths">Z kolika uzavřených měsíců je průměr.</param>
/// <param name="History">Uzavřené měsíce skutečnosti (nejstarší první); <paramref name="HistoryStart"/> = zůstatek před prvním z nich.</param>
public record PredictionDto(DateOnly Today, int Horizon, int? MemberId, decimal Start, decimal Reserve, int DataMonths, IReadOnlyList<PredMonth> Months,
    IReadOnlyList<PredNode> Tree, IReadOnlyList<PredOneOff> OneOffs, Scenario Scenario, decimal HistoryStart, IReadOnlyList<PlanMonth> History,
    IReadOnlyList<TopGroup> Groups, IReadOnlyList<SnapshotDto> Snapshots);

/// <summary>
/// Predikce disponibilního zůstatku po měsících. Výchozí predikce = dnešní zůstatek disponibilních účtů + po kategoriích pevné
/// pravidelné platby (měsíční a týdenní podle kalendáře) a průměr ostatních plateb za posledních 6 (3, 1) uzavřených měsíců, převody mimo
/// disponibilní účty a očekávané jednorázové platby (čtvrtletní a roční pravidelné, odhady od AI). V aktuálním měsíci jen zbytek:
/// průměr minus to, co už proběhlo. Scénář domácnosti mění částky od měsíce, přidává platby a vynechává očekávané. Uložené predikce
/// se po uzavřených měsících porovnávají se skutečností.
/// </summary>
public partial class PredictionService(AppDbContext db, StatsService stats, RecurringService recurring, FxService fx, TimeProvider time)
{
    public const int HistoryMonths = 12;
    public const int AverageMonths = 6;
    public static readonly int[] AverageOptions = [6, 3, 1];
    public static readonly int[] Horizons = [6, 12, 24, 36];
    public const int MaxSnapshots = 100;
    public const int MaxExpected = 200;
    public const int MaxItems = 500;
    public const int NameMax = 100;
    private const decimal AmountMax = 100_000_000;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static int NormalizeHorizon(int horizon) => Horizons.Contains(horizon) ? horizon : 12;
    public static int NormalizeAverage(int months) => AverageOptions.Contains(months) ? months : AverageMonths;

    /// <param name="avgMonths">Z kolika posledních uzavřených měsíců se počítá průměr (6, 3 nebo 1).</param>
    public async Task<PredictionDto> GetAsync(int horizon, int? memberId, int avgMonths = AverageMonths)
    {
        var d = await LoadAsync(NormalizeHorizon(horizon), NormalizeAverage(avgMonths));
        var row = await db.ForecastScenarios.AsNoTracking().FirstOrDefaultAsync();
        var sc = Clean(Read(row), d.M0);
        var hh = await BaselineAsync(d, null);
        var view = memberId is null ? hh : await BaselineAsync(d, memberId);
        var sim = Simulate(d, view, hh, sc, memberId);
        var snapshots = await db.ForecastSnapshots.AsNoTracking().OrderByDescending(s => s.SavedOn).ThenByDescending(s => s.Id).ToListAsync();
        var viewKey = memberId?.ToString(CultureInfo.InvariantCulture) ?? "all";
        return new PredictionDto(d.Today, d.H, memberId, view.Start, Reserve(d, row), d.AvgMonths, sim.Months, Tree(d, sim, sc),
            sim.Ones.Select(o => new PredOneOff(o.Key, Ym(d.M0.AddMonths(o.Index)), o.Name, o.Amount, o.Source, o.Kind, o.Skipped, o.TopKey)).ToList(),
            sc, view.HistoryStart, view.History, Groups(d),
            snapshots.Select(s => new SnapshotDto(s.Id, s.Name, s.SavedOn, s.Horizon, s.CreatedBy,
                JsonSerializer.Deserialize<Dictionary<string, SnapshotPlan>>(s.PlanJson, Json)?.GetValueOrDefault(viewKey))).ToList());
    }

    // ---------- Scénář, rezerva ----------

    public async Task<Scenario> GetScenarioAsync() => Clean(Read(await db.ForecastScenarios.AsNoTracking().FirstOrDefaultAsync()), M0(time.Today()));

    public async Task SaveScenarioAsync(Scenario scenario, string actor)
    {
        var row = await RowAsync();
        row.Json = JsonSerializer.Serialize(Validate(scenario, M0(time.Today())), Json);
        row.UpdatedBy = Truncate(actor, 200);
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync();
    }

    public async Task SetReserveAsync(decimal? reserve)
    {
        if (reserve is < 0 or > AmountMax) throw new DomainException("Rezerva musí být kladná částka.");
        var row = await RowAsync();
        row.Reserve = reserve is { } r ? Math.Round(r, 0) : null;
        await db.SaveChangesAsync();
    }

    private async Task<ForecastScenario> RowAsync()
    {
        var row = await db.ForecastScenarios.FirstOrDefaultAsync();
        if (row is null)
        {
            row = new ForecastScenario { UpdatedAt = time.GetUtcNow() };
            db.ForecastScenarios.Add(row);
        }
        return row;
    }

    private static Scenario Read(ForecastScenario? row) =>
        row is null ? new Scenario() : JsonSerializer.Deserialize<Scenario>(row.Json, Json) ?? new Scenario();

    private static decimal Reserve(Data d, ForecastScenario? row) =>
        row?.Reserve ?? d.Accounts.Sum(a => a.LowBalanceLimit ?? 0);

    [GeneratedRegex(@"^(c\d+|ui|ue|t\d+|x|a[A-Za-z0-9_-]{1,40})$")]
    private static partial Regex KeyRegex();

    [GeneratedRegex(@"^[A-Za-z0-9_-]{1,40}$")]
    private static partial Regex IdRegex();

    [GeneratedRegex(@"^[re]\d+:\d{4}-\d{2}$")]
    private static partial Regex SkipRegex();

    /// <summary>Kontrola vstupu z klienta (chyby česky) a vyčištění prošlých položek.</summary>
    public static Scenario Validate(Scenario s, DateOnly m0)
    {
        var changes = s.Changes ?? [];
        var added = s.Added ?? [];
        var ones = s.OneOffs ?? [];
        var skips = s.Skips ?? [];
        if (changes.Count + added.Count + ones.Count + skips.Count > MaxItems) throw new DomainException($"Scénář může mít nejvýš {MaxItems} úprav.");
        foreach (var c in changes)
        {
            if (!IdRegex().IsMatch(c.Id ?? "") || !KeyRegex().IsMatch(c.Key ?? "")) throw new DomainException("Neplatná úprava scénáře.");
            var from = ParseMonth(c.From);
            if (c.To is { } to && ParseMonth(to) < from) throw new DomainException("Úprava končí dřív, než začíná.");
            CheckAmount(c.Amount);
        }
        foreach (var a in added)
        {
            if (!IdRegex().IsMatch(a.Id ?? "")) throw new DomainException("Neplatná úprava scénáře.");
            CheckName(a.Name);
            ParseMonth(a.From);
            CheckAmount(a.Amount);
            if (a.Amount == 0) throw new DomainException("Zadejte částku.");
        }
        foreach (var o in ones)
        {
            if (!IdRegex().IsMatch(o.Id ?? "")) throw new DomainException("Neplatná úprava scénáře.");
            CheckName(o.Name);
            ParseMonth(o.Month);
            CheckAmount(o.Amount);
            if (o.Amount == 0) throw new DomainException("Zadejte částku.");
        }
        if (skips.Any(k => !SkipRegex().IsMatch(k ?? ""))) throw new DomainException("Neplatná úprava scénáře.");
        return Clean(new Scenario(
            changes.Select(c => c with { Amount = Math.Round(c.Amount, 0) }).ToList(),
            added.Select(a => a with { Name = a.Name.Trim(), Amount = Math.Round(a.Amount, 0) }).ToList(),
            ones.Select(o => o with { Name = o.Name.Trim(), Amount = Math.Round(o.Amount, 0) }).ToList(),
            skips.Distinct().ToList()), m0);
    }

    /// <summary>Bez položek, které už celé proběhly (jednorázové a úpravy před aktuálním měsícem), a úprav zrušených nových plateb.</summary>
    public static Scenario Clean(Scenario s, DateOnly m0)
    {
        var added = (s.Added ?? []).ToList();
        var addedKeys = added.Select(a => "a" + a.Id).ToHashSet();
        return new Scenario(
            (s.Changes ?? []).Where(c => (c.To is null || TryMonth(c.To) >= m0) && (!c.Key.StartsWith('a') || addedKeys.Contains(c.Key))).ToList(),
            added,
            (s.OneOffs ?? []).Where(o => TryMonth(o.Month) >= m0).ToList(),
            (s.Skips ?? []).Where(k => TryMonth(k[(k.IndexOf(':') + 1)..]) >= m0).ToList());
    }

    private static void CheckAmount(decimal a)
    {
        if (Math.Abs(a) > AmountMax) throw new DomainException("Částka je příliš velká.");
    }

    private static void CheckName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Zadejte název.");
        if (name.Trim().Length > NameMax) throw new DomainException($"Název může mít nejvýš {NameMax} znaků.");
    }

    public static DateOnly ParseMonth(string? ym) =>
        TryMonth(ym) is { } m && m != DateOnly.MinValue ? m : throw new DomainException($"Neplatný měsíc „{ym}“ (čekám RRRR-MM).");

    private static DateOnly TryMonth(string? ym) =>
        DateOnly.TryParseExact($"{ym}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : DateOnly.MinValue;

    private static string Ym(DateOnly d) => d.ToString("yyyy-MM", CultureInfo.InvariantCulture);
    private static DateOnly M0(DateOnly today) => new(today.Year, today.Month, 1);
    private static int MonthIndex(DateOnly from, DateOnly date) => (date.Year - from.Year) * 12 + date.Month - from.Month;
    private static string Truncate(string s, int max) => s.Length > max ? s[..max] : s;

    // ---------- Uložené predikce ----------

    public async Task<int> SaveSnapshotAsync(string? name, int horizon, string actor, int avgMonths = AverageMonths)
    {
        var count = await db.ForecastSnapshots.CountAsync();
        if (count >= MaxSnapshots) throw new DomainException($"Uložených predikcí je už {MaxSnapshots}. Nejdřív nějakou smažte.");
        name = string.IsNullOrWhiteSpace(name) ? $"Predikce {count + 1}" : name.Trim();
        if (name.Length > NameMax) throw new DomainException($"Název může mít nejvýš {NameMax} znaků.");
        var d = await LoadAsync(NormalizeHorizon(horizon), NormalizeAverage(avgMonths));
        var sc = await GetScenarioAsync();
        var hh = await BaselineAsync(d, null);
        var plans = new Dictionary<string, SnapshotPlan> { ["all"] = Plan(d, hh, Simulate(d, hh, hh, sc, null)) };
        foreach (var m in d.MemberIds)
        {
            var b = await BaselineAsync(d, m);
            plans[m.ToString(CultureInfo.InvariantCulture)] = Plan(d, b, Simulate(d, b, hh, sc, m));
        }
        var s = new ForecastSnapshot
        {
            Name = name, SavedOn = d.Today, Horizon = d.H, PlanJson = JsonSerializer.Serialize(plans, Json), CreatedBy = Truncate(actor, 200),
            CreatedAt = time.GetUtcNow(),
        };
        db.ForecastSnapshots.Add(s);
        await db.SaveChangesAsync();
        return s.Id;
    }

    public async Task DeleteSnapshotAsync(int id)
    {
        var s = await db.ForecastSnapshots.FindAsync(id) ?? throw new DomainException("Uložená predikce neexistuje.");
        db.ForecastSnapshots.Remove(s);
        await db.SaveChangesAsync();
    }

    // ---------- Očekávané platby ----------

    public async Task<List<ExpectedPaymentDto>> ListExpectedAsync() =>
        (await db.ExpectedPayments.AsNoTracking().OrderBy(e => e.Month).ThenBy(e => e.Id).ToListAsync()).Select(ToDto).ToList();

    public async Task<ExpectedPaymentDto> AddExpectedAsync(ExpectedPaymentInput input, string actor)
    {
        if (await db.ExpectedPayments.CountAsync() >= MaxExpected)
            throw new DomainException($"Očekávaných plateb je už {MaxExpected}. Smažte zastaralé, než přidáte další.");
        CheckName(input.Name);
        var month = ParseMonth(input.Month);
        if (input.Amount == 0) throw new DomainException("Zadejte částku (záporná = výdaj).");
        CheckAmount(input.Amount);
        if (input.MemberId is { } m && !await db.Members.AnyAsync(x => x.Id == m)) throw new DomainException("Člen neexistuje.");
        if (!input.Yearly && month < M0(time.Today())) throw new DomainException("Jednorázová platba v minulém měsíci se do predikce nepromítne.");
        var e = new ExpectedPayment
        {
            Name = input.Name!.Trim(), Month = month, Amount = Math.Round(input.Amount, 0), Yearly = input.Yearly, MemberId = input.MemberId,
            Note = string.IsNullOrWhiteSpace(input.Note) ? null : Truncate(input.Note.Trim(), NameMax), CreatedBy = Truncate(actor, 200),
            CreatedAt = time.GetUtcNow(),
        };
        db.ExpectedPayments.Add(e);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    public async Task DeleteExpectedAsync(int id)
    {
        var e = await db.ExpectedPayments.FindAsync(id) ?? throw new DomainException($"Očekávaná platba {id} neexistuje.");
        db.ExpectedPayments.Remove(e);
        await db.SaveChangesAsync();
    }

    private static ExpectedPaymentDto ToDto(ExpectedPayment e) => new(e.Id, e.Name, Ym(e.Month), e.Amount, e.Yearly, e.MemberId, e.Note, e.CreatedBy);

    // ---------- Podklady ----------

    private sealed record TxRow(int Id, int AccountId, DateOnly Date, decimal Amount, decimal AmountCzk, TransactionKind Kind, int? RecurringId,
        int? PairId, int? TransferAccountId, bool BetweenMembers);

    /// <summary>Převod mezi disponibilním účtem a účtem mimo ně (spoření, investice, cizí účet).</summary>
    private sealed record Boundary(int AccountId, DateOnly Date, decimal AmountCzk, bool Paired, bool BetweenMembers);

    private sealed class Data
    {
        public DateOnly Today, M0, HistFrom, AvgFrom;
        public int H, AvgMonths;
        public List<Account> Accounts = [];
        public Dictionary<int, Account> ById = [];
        public HashSet<int> Ids = [];
        public List<Category> Cats = [];
        public Dictionary<int, CategoryNode> Nodes = [];
        public Dictionary<int, RecurringPayment> Recurring = [];
        /// <summary>Pravidelné převody, které opouštějí disponibilní účty (nebo na ně přicházejí zvenčí).</summary>
        public HashSet<int> BoundaryRecurring = [];
        public List<Occurrence> Occurrences = [];
        public ILookup<int, (DateOnly Date, decimal Amount)> ByAccount = null!;
        /// <summary>Pohyb → pravidelná platba (aktivní nebo ukončená).</summary>
        public Dictionary<int, int> Paired = [];
        public List<Boundary> Transfers = [];
        public Dictionary<string, decimal> Rates = [];
        public List<ExpectedPayment> Expected = [];
        public List<int> MemberIds = [];
    }

    private async Task<Data> LoadAsync(int horizon, int avgMonths)
    {
        var today = time.Today();
        var d = new Data { Today = today, M0 = M0(today), H = horizon };
        d.HistFrom = d.M0.AddMonths(-HistoryMonths);
        d.Accounts = await db.Accounts.AsNoTracking().Include(a => a.Shares)
            .Where(a => !a.Archived && a.IncludeInDisposable && a.Kind != AccountKind.Investment).OrderBy(a => a.SortOrder).ToListAsync();
        d.ById = d.Accounts.ToDictionary(a => a.Id);
        d.Ids = d.ById.Keys.ToHashSet();
        d.Cats = await db.Categories.AsNoTracking().ToListAsync();
        d.Nodes = CategoryService.BuildTree(d.Cats).ToDictionary(n => n.Id);
        d.Recurring = await db.RecurringPayments.AsNoTracking().Where(r => r.Status != RecurringStatus.Suggested).ToDictionaryAsync(r => r.Id);
        d.MemberIds = await db.Members.AsNoTracking().OrderBy(m => m.SortOrder).Select(m => m.Id).ToListAsync();
        d.Expected = await db.ExpectedPayments.AsNoTracking().ToListAsync();
        d.Rates = await fx.LatestAsync(today);
        var ids = d.Ids.ToList();
        var txs = await db.Transactions.AsNoTracking().Where(t => ids.Contains(t.AccountId))
            .Select(t => new TxRow(t.Id, t.AccountId, t.Date, t.Amount, t.AmountCzk, t.Kind, t.RecurringPaymentId, t.TransferPairId, t.TransferAccountId,
                t.BetweenMembers))
            .ToListAsync();
        d.ByAccount = txs.ToLookup(t => t.AccountId, t => (t.Date, t.Amount));
        d.Paired = txs.Where(t => t.RecurringId is { } r && d.Recurring.ContainsKey(r)).ToDictionary(t => t.Id, t => t.RecurringId!.Value);

        // Protiúčet převodu: účet spárovaného protějšku, jinak zadaný účet; neznámý = mimo disponibilní účty
        var transfers = txs.Where(t => t.Kind is TransactionKind.Transfer or TransactionKind.InvestmentTransfer).ToList();
        var pairIds = transfers.Where(t => t.PairId is not null).Select(t => t.PairId!.Value).ToList();
        var pairAccounts = await db.Transactions.AsNoTracking().Where(t => pairIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.AccountId);
        bool Inside(TxRow t) => (t.PairId is { } p && pairAccounts.TryGetValue(p, out var pa) ? pa : t.TransferAccountId) is { } c && d.Ids.Contains(c);
        d.Transfers = transfers.Where(t => !Inside(t) && t.Date >= d.HistFrom)
            .Select(t => new Boundary(t.AccountId, t.Date, t.AmountCzk, d.Paired.ContainsKey(t.Id), t.BetweenMembers)).ToList();
        var insideRecurring = transfers.Where(t => t.RecurringId is not null && Inside(t)).Select(t => t.RecurringId!.Value).ToHashSet();
        d.BoundaryRecurring = d.Recurring.Values.Where(r => r.IsTransfer && d.Ids.Contains(r.AccountId) && !insideRecurring.Contains(r.Id))
            .Select(r => r.Id).ToHashSet();
        d.Occurrences = await recurring.OccurrencesAsync(d.M0, d.M0.AddMonths(horizon).AddDays(-1));

        // Průměr z uzavřených měsíců, ve kterých už jsou data (nejvýš avgMonths); když žádný celý není, aspoň z neúplného
        var first = txs.Count > 0 ? txs.Min(t => t.Date) : (DateOnly?)null;
        var start = first is { } f ? (f.Day <= 3 ? M0(f) : M0(f).AddMonths(1)) : d.M0;
        d.AvgFrom = start > d.M0.AddMonths(-avgMonths) ? start : d.M0.AddMonths(-avgMonths);
        d.AvgMonths = Math.Max(0, MonthIndex(d.AvgFrom, d.M0));
        if (d.AvgMonths == 0 && first is { } f2 && f2 < d.M0)
        {
            d.AvgFrom = M0(f2);
            d.AvgMonths = 1;
        }
        return d;
    }

    /// <summary>Váha účtu pro člena: vlastní 1, cizí 0, společný podle poměru k datu.</summary>
    private static decimal Weight(Account a, DateOnly date, int? memberId) =>
        memberId is not { } m ? 1 : a.OwnerMemberId is { } o ? (o == m ? 1 : 0) : ShareService.RatioAt(a, date).GetValueOrDefault(m) / 100m;

    /// <summary>Podíl člena na společných položkách (bez člena): průměrný poměr společných disponibilních účtů, jinak rovným dílem.</summary>
    private static decimal SharedWeight(Data d, int? memberId)
    {
        if (memberId is not { } m) return 1;
        var joint = d.Accounts.Where(a => a.IsJoint && a.Shares.Count > 0).ToList();
        if (joint.Count > 0) return Math.Round(joint.Average(a => ShareService.RatioAt(a, d.Today).GetValueOrDefault(m) / 100m), 4);
        return d.MemberIds.Count > 0 ? Math.Round(1m / d.MemberIds.Count, 4) : 1;
    }

    private static decimal ItemWeight(int? itemMember, int? memberId, decimal shared) =>
        memberId is null ? 1 : itemMember is null ? shared : itemMember == memberId ? 1 : 0;

    private decimal Balance(Data d, Account a, DateOnly date) =>
        BalanceService.BalanceFrom(a, d.ByAccount[a.Id], date) * d.Rates.GetValueOrDefault(a.Currency, 1m);

    private static string TopKey(Data d, int? categoryId) =>
        categoryId is { } c && d.Nodes.TryGetValue(c, out var n) ? $"c{n.TopId}" : "u";

    // ---------- Výchozí predikce jednoho pohledu ----------

    private sealed class Leaf(string key, int h)
    {
        public readonly string Key = key;
        public decimal Sum, Mtd, Avg, FixedTypical;
        public readonly decimal[] Fixed = new decimal[h];
        public decimal[] Base = [];
        public readonly List<RecurringPayment> Recurring = [];
        public decimal Typical => Avg + FixedTypical;
    }

    private sealed record One(string Key, int Index, string Name, decimal Amount, string Source, string Kind, string TopKey, bool Skipped = false);

    private sealed class MonthAcc(DateOnly month)
    {
        public readonly DateOnly Month = month;
        public decimal Income, Expense;
        public readonly Dictionary<string, decimal> Cats = [];
        public readonly Dictionary<string, decimal> Ones = [];

        public void Add(string top, decimal amount, bool income)
        {
            if (income) Income += amount;
            else Expense += amount;
            Cats[top] = Cats.GetValueOrDefault(top) + amount;
        }
    }

    private sealed class Baseline
    {
        public readonly Dictionary<string, Leaf> Leaves = [];
        public readonly List<One> Ones = [];
        public decimal Start, HistoryStart, Sigma;
        public List<PlanMonth> History = [];
        public MonthAcc Mtd = null!;
    }

    private async Task<Baseline> BaselineAsync(Data d, int? memberId)
    {
        var b = new Baseline();
        Leaf L(string key) => b.Leaves.TryGetValue(key, out var x) ? x : b.Leaves[key] = new Leaf(key, d.H);
        decimal W(int accountId, DateOnly date) => Weight(d.ById[accountId], date, memberId);
        var hist = Enumerable.Range(0, HistoryMonths).Select(j => new MonthAcc(d.HistFrom.AddMonths(j))).ToArray();
        b.Mtd = new MonthAcc(d.M0);
        MonthAcc Acc(DateOnly date) => date >= d.M0 ? b.Mtd : hist[MonthIndex(d.HistFrom, date)];
        var variable = new decimal[HistoryMonths];
        var recCat = new Dictionary<int, (DateOnly Date, int? Cat)>();

        var lines = await stats.LinesAsync(new StatsFilter(new DateRange(d.HistFrom, d.Today), memberId), d.Cats);
        foreach (var l in lines.Where(l => d.Ids.Contains(l.AccountId)))
        {
            var acc = Acc(l.Date);
            acc.Add(TopKey(d, l.CategoryId), l.Amount, l.Kind == CategoryKind.Income);
            if (d.Paired.TryGetValue(l.TxId, out var rid))
            {
                // Pokrývá ji pravidelná platba (pevná částka nebo očekávaná jednorázová) – do průměru nepatří
                var r = d.Recurring[rid];
                if (r.Frequency is Frequency.Quarterly or Frequency.Yearly) acc.Ones[r.Name] = acc.Ones.GetValueOrDefault(r.Name) + l.Amount;
                if (!recCat.TryGetValue(rid, out var rc) || rc.Date <= l.Date) recCat[rid] = (l.Date, l.CategoryId);
                continue;
            }
            var leaf = L(l.CategoryId is { } c ? $"c{c}" : l.Kind == CategoryKind.Income ? "ui" : "ue");
            if (l.Date >= d.M0) leaf.Mtd += l.Amount;
            else if (l.Date >= d.AvgFrom)
            {
                leaf.Sum += l.Amount;
                variable[MonthIndex(d.HistFrom, l.Date)] += l.Amount;
            }
        }
        foreach (var t in d.Transfers)
        {
            // U člena se převody mezi členy počítají jako příjem/výdaj už ve statistikách
            if (memberId is not null && t.BetweenMembers) continue;
            var a = Math.Round(t.AmountCzk * W(t.AccountId, t.Date), 2);
            if (a == 0) continue;
            Acc(t.Date).Add("x", a, a > 0);
            if (t.Paired) continue;
            var leaf = L("x");
            if (t.Date >= d.M0) leaf.Mtd += a;
            else if (t.Date >= d.AvgFrom)
            {
                leaf.Sum += a;
                variable[MonthIndex(d.HistFrom, t.Date)] += a;
            }
        }
        foreach (var leaf in b.Leaves.Values) leaf.Avg = d.AvgMonths > 0 ? Math.Round(leaf.Sum / d.AvgMonths, 0) : 0;

        // Pevná část: měsíční a týdenní pravidelné platby podle kalendáře; čtvrtletní a roční jako očekávané jednorázové
        var excluded = d.Nodes.Values.Where(n => n.EffectiveExclude).Select(n => n.Id).ToHashSet();
        bool Counts(RecurringPayment r) => d.Ids.Contains(r.AccountId) && (r.IsTransfer ? d.BoundaryRecurring.Contains(r.Id)
            : r.CategoryId is not { } c || !excluded.Contains(c));
        string FixedKey(RecurringPayment r) => r.IsTransfer ? $"t{r.Id}"
            : (r.CategoryId ?? recCat.GetValueOrDefault(r.Id).Cat) is { } c && d.Nodes.ContainsKey(c) ? $"c{c}" : r.Amount > 0 ? "ui" : "ue";
        foreach (var o in d.Occurrences)
        {
            if (o.State != OccurrenceState.Expected || !d.Recurring.TryGetValue(o.RecurringId, out var r) || !Counts(r)) continue;
            var i = MonthIndex(d.M0, o.Due);
            if (i < 0 || i >= d.H) continue;
            var amt = Math.Round(o.AmountCzk * W(r.AccountId, o.Due), 2);
            if (amt == 0) continue;
            if (r.Frequency is Frequency.Quarterly or Frequency.Yearly)
                b.Ones.Add(new One($"r{r.Id}:{Ym(o.Due)}", i, r.Name, Math.Round(amt, 0), r.Frequency == Frequency.Yearly ? "ročně" : "čtvrtletně",
                    "recurring", r.IsTransfer ? "x" : TopKey(d, r.CategoryId ?? recCat.GetValueOrDefault(r.Id).Cat)));
            else L(FixedKey(r)).Fixed[i] += amt;
        }
        foreach (var r in d.Recurring.Values.Where(r => r.Status == RecurringStatus.Active && r.Frequency is Frequency.Monthly or Frequency.Weekly && Counts(r)))
        {
            var leaf = L(FixedKey(r));
            leaf.FixedTypical += Math.Round(RecurringSchedule.MonthlyEquivalent(r) * d.Rates.GetValueOrDefault(d.ById[r.AccountId].Currency, 1m)
                * W(r.AccountId, d.Today), 0);
            leaf.Recurring.Add(r);
        }
        foreach (var leaf in b.Leaves.Values)
        {
            leaf.Base = new decimal[d.H];
            for (var i = 0; i < d.H; i++) leaf.Base[i] = Math.Round(leaf.Fixed[i] + (i == 0 ? Remaining(leaf.Avg, leaf.Mtd) : leaf.Avg), 0);
        }

        var shared = SharedWeight(d, memberId);
        foreach (var e in d.Expected)
        {
            var amt = Math.Round(e.Amount * ItemWeight(e.MemberId, memberId, shared), 0);
            if (amt == 0) continue;
            for (var i = 0; i < d.H; i++)
            {
                var m = d.M0.AddMonths(i);
                if (e.Yearly ? m >= e.Month && m.Month == e.Month.Month : m == e.Month)
                    b.Ones.Add(new One($"e{e.Id}:{Ym(m)}", i, e.Name, amt, e.Note ?? "očekávaná platba", "expected", "o"));
            }
        }

        b.Start = Math.Round(d.Accounts.Sum(a => Balance(d, a, d.Today) * W(a.Id, d.Today)), 0);
        decimal BalanceAt(DateOnly date) => Math.Round(d.Accounts.Sum(a => Balance(d, a, date) * W(a.Id, date)), 0);
        b.HistoryStart = BalanceAt(d.HistFrom.AddDays(-1));
        b.History = hist.Select(h => ToPlanMonth(h, BalanceAt(h.Month.AddMonths(1).AddDays(-1)))).ToList();

        // Rozptyl: směrodatná odchylka měsíčních součtů proměnlivých plateb
        var vm = Enumerable.Range(0, HistoryMonths).Where(j => hist[j].Month >= d.AvgFrom).Select(j => (double)variable[j]).ToList();
        if (vm.Count >= 2)
        {
            var mean = vm.Average();
            b.Sigma = Math.Round((decimal)Math.Sqrt(vm.Sum(v => (v - mean) * (v - mean)) / (vm.Count - 1)), 0);
        }
        else b.Sigma = Math.Round(b.Leaves.Values.Sum(l => Math.Abs(l.Avg)) * 0.05m, 0);
        return b;
    }

    private static PlanMonth ToPlanMonth(MonthAcc m, decimal balance) => new(Ym(m.Month), Math.Round(m.Income, 0), Math.Round(m.Expense, 0), balance,
        m.Cats.Where(kv => Math.Round(kv.Value, 0) != 0).ToDictionary(kv => kv.Key, kv => Math.Round(kv.Value, 0)),
        m.Ones.Where(kv => Math.Round(kv.Value, 0) != 0).Select(kv => new PlanOne(kv.Key, Math.Round(kv.Value, 0))).ToList());

    /// <summary>Zbytek měsíce: průměr minus to, co už proběhlo (ve stejném směru), nejvýš do nuly.</summary>
    public static decimal Remaining(decimal average, decimal soFar)
    {
        if (average == 0) return 0;
        var s = Math.Sign(average);
        return s * Math.Max(0, Math.Abs(average) - s * soFar);
    }

    // ---------- Scénář nad výchozí predikcí ----------

    private sealed class SimLeaf(string key, decimal[] @base, decimal[] value, decimal share, int sign)
    {
        public readonly string Key = key;
        public readonly decimal[] Base = @base, Value = value;
        public readonly decimal Share = share;
        public readonly int Sign = sign;
        public Leaf? Source;
        public string? Name;
        public string TopKey = "u";
        public bool Changed;
        public bool Visible => Changed || Base.Any(v => v != 0) || Value.Any(v => v != 0);
    }

    private sealed class Sim
    {
        public readonly Dictionary<string, SimLeaf> Leaves = [];
        public List<One> Ones = [];
        public List<PredMonth> Months = [];
    }

    private static Sim Simulate(Data d, Baseline b, Baseline hh, Scenario sc, int? memberId)
    {
        var sim = new Sim();
        var shared = SharedWeight(d, memberId);
        int Idx(string ym) => MonthIndex(d.M0, ParseMonth(ym));
        decimal ShareOf(string key)
        {
            if (memberId is null) return 1;
            var h = hh.Leaves.GetValueOrDefault(key)?.Typical ?? 0;
            return h != 0 ? Math.Round(Math.Abs((b.Leaves.GetValueOrDefault(key)?.Typical ?? 0) / h), 4) : shared;
        }
        int SignOf(string key, Leaf? l) => key switch
        {
            "ui" => 1,
            "ue" => -1,
            _ when key[0] == 'c' => d.Nodes.TryGetValue(int.Parse(key[1..], CultureInfo.InvariantCulture), out var n) && n.Kind == CategoryKind.Income ? 1 : -1,
            _ when key[0] == 't' => d.Recurring.TryGetValue(int.Parse(key[1..], CultureInfo.InvariantCulture), out var r) && r.Amount > 0 ? 1 : -1,
            _ => (l?.Typical ?? 0) > 0 ? 1 : -1,
        };
        string Top(string key) => key[0] switch
        {
            'c' => TopKey(d, int.Parse(key[1..], CultureInfo.InvariantCulture)),
            't' or 'x' => "x",
            'a' => "n",
            _ => "u",
        };
        bool Valid(string key) => key[0] switch
        {
            'c' => d.Nodes.TryGetValue(int.Parse(key[1..], CultureInfo.InvariantCulture), out var n) && !n.EffectiveExclude,
            't' => d.BoundaryRecurring.Contains(int.Parse(key[1..], CultureInfo.InvariantCulture)),
            _ => key is "ui" or "ue" or "x",
        };

        foreach (var l in b.Leaves.Values)
            sim.Leaves[l.Key] = new SimLeaf(l.Key, l.Base, (decimal[])l.Base.Clone(), ShareOf(l.Key), SignOf(l.Key, l)) { Source = l, TopKey = Top(l.Key) };
        foreach (var a in sc.Added ?? [])
        {
            var w = ItemWeight(a.MemberId, memberId, shared);
            var v = new decimal[d.H];
            for (var i = Math.Max(0, Idx(a.From)); i < d.H; i++) v[i] = Math.Round(a.Amount * w, 0);
            sim.Leaves["a" + a.Id] = new SimLeaf("a" + a.Id, new decimal[d.H], v, w, Math.Sign(a.Amount)) { Name = a.Name, TopKey = "n" };
        }
        foreach (var c in sc.Changes ?? [])
        {
            if (!sim.Leaves.TryGetValue(c.Key, out var leaf))
            {
                // Položka bez historie (průměr vypadl z okna) – úprava platí dál
                if (!Valid(c.Key)) continue;
                var zero = new decimal[d.H];
                leaf = sim.Leaves[c.Key] = new SimLeaf(c.Key, zero, new decimal[d.H], memberId is null ? 1 : shared, SignOf(c.Key, null)) { TopKey = Top(c.Key) };
            }
            leaf.Changed = true;
            var to = c.To is null ? d.H - 1 : Math.Min(d.H - 1, Idx(c.To));
            for (var i = Math.Max(0, Idx(c.From)); i <= to; i++) leaf.Value[i] = Math.Round(c.Amount * leaf.Share, 0);
        }

        var skips = (sc.Skips ?? []).ToHashSet();
        sim.Ones = b.Ones.Select(o => o with { Skipped = skips.Contains(o.Key) }).ToList();
        foreach (var o in sc.OneOffs ?? [])
        {
            var i = Idx(o.Month);
            var amt = Math.Round(o.Amount * ItemWeight(o.MemberId, memberId, shared), 0);
            if (i < 0 || i >= d.H || amt == 0) continue;
            sim.Ones.Add(new One("o" + o.Id, i, o.Name, amt, "přidáno ve scénáři", "scenario", "o"));
        }
        sim.Ones = sim.Ones.OrderBy(o => o.Index).ThenBy(o => o.Amount).ToList();

        decimal bal = b.Start, baseBal = b.Start;
        for (var i = 0; i < d.H; i++)
        {
            decimal inc = 0, exp = 0, bInc = 0, bExp = 0;
            void Add(decimal v, ref decimal plus, ref decimal minus)
            {
                if (v > 0) plus += v;
                else minus += v;
            }
            foreach (var l in sim.Leaves.Values)
            {
                Add(l.Value[i], ref inc, ref exp);
                Add(l.Base[i], ref bInc, ref bExp);
            }
            foreach (var o in sim.Ones.Where(o => o.Index == i))
            {
                // Výchozí predikce: všechny očekávané, bez přidaných ve scénáři
                if (!o.Skipped) Add(o.Amount, ref inc, ref exp);
                if (o.Kind != "scenario") Add(o.Amount, ref bInc, ref bExp);
            }
            bal += inc + exp;
            baseBal += bInc + bExp;
            sim.Months.Add(new PredMonth(Ym(d.M0.AddMonths(i)), inc, exp, bal, bInc, bExp, baseBal, Math.Round(b.Sigma * (decimal)Math.Sqrt(i + 1), 0)));
        }
        return sim;
    }

    /// <summary>Plán k uložení: měsíce se scénářem, aktuální měsíc celý (co už proběhlo + zbytek).</summary>
    private static SnapshotPlan Plan(Data d, Baseline b, Sim sim) => new(b.Start, sim.Months.Select((m, i) =>
    {
        var acc = new MonthAcc(d.M0.AddMonths(i));
        foreach (var l in sim.Leaves.Values.Where(l => l.Value[i] != 0)) acc.Add(l.TopKey, l.Value[i], l.Value[i] > 0);
        foreach (var o in sim.Ones.Where(o => o.Index == i && !o.Skipped))
        {
            acc.Add(o.TopKey, o.Amount, o.Amount > 0);
            acc.Ones[o.Name] = acc.Ones.GetValueOrDefault(o.Name) + o.Amount;
        }
        if (i == 0)
        {
            acc.Income += b.Mtd.Income;
            acc.Expense += b.Mtd.Expense;
            foreach (var (k, v) in b.Mtd.Cats) acc.Cats[k] = acc.Cats.GetValueOrDefault(k) + v;
            foreach (var (k, v) in b.Mtd.Ones) acc.Ones[k] = acc.Ones.GetValueOrDefault(k) + v;
        }
        return ToPlanMonth(acc, m.Balance);
    }).ToList());

    // ---------- Strom položek ----------

    private static List<PredNode> Tree(Data d, Sim sim, Scenario sc)
    {
        PredNode? LeafNode(string key, string name, string color) =>
            sim.Leaves.TryGetValue(key, out var l) && l.Visible ? new PredNode(key, name, color, null, new PredLeaf(Note(l, d), l.Sign, l.Share, l.Base, l.Value)) : null;
        var nodes = d.Nodes.Values.Where(n => !n.EffectiveExclude).ToList();
        var byParent = nodes.ToLookup(n => n.ParentId);
        PredNode? Cat(CategoryNode n)
        {
            var kids = byParent[n.Id].OrderBy(c => c.SortOrder).ThenBy(c => c.Name).Select(Cat).OfType<PredNode>().ToList();
            var own = LeafNode($"c{n.Id}", kids.Count > 0 ? "Bez podkategorie" : n.Name, n.Color);
            if (kids.Count == 0) return own;
            if (own is not null) kids.Add(own);
            return new PredNode($"p{n.Id}", n.Name, n.Color, kids, null);
        }
        var tops = byParent[null].OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToList();
        var result = new List<PredNode>();
        var income = tops.Where(n => n.Kind == CategoryKind.Income).Select(Cat).OfType<PredNode>().ToList();
        if (LeafNode("ui", "Nezařazené příjmy", "pos") is { } ui) income.Add(ui);
        if (income.Count > 0) result.Add(new PredNode("g:inc", "Příjmy", "pos", income, null));
        result.AddRange(tops.Where(n => n.Kind == CategoryKind.Expense).Select(Cat).OfType<PredNode>());
        if (LeafNode("ue", "Nezařazené výdaje", "ink-3") is { } ue) result.Add(ue);
        var transfers = sim.Leaves.Keys.Where(k => k[0] == 't').OrderBy(k => d.Recurring[int.Parse(k[1..], CultureInfo.InvariantCulture)].Name)
            .Select(k => LeafNode(k, d.Recurring[int.Parse(k[1..], CultureInfo.InvariantCulture)].Name, "c11")).OfType<PredNode>().ToList();
        if (LeafNode("x", "Ostatní převody", "c11") is { } x) transfers.Add(x);
        if (transfers.Count > 0) result.Add(new PredNode("g:x", "Spoření a převody", "c11", transfers, null));
        var added = (sc.Added ?? []).Select(a => LeafNode("a" + a.Id, a.Name, "accent")).OfType<PredNode>().ToList();
        if (added.Count > 0) result.Add(new PredNode("g:new", "Nové pravidelné", "accent", added, null));
        return result;
    }

    private static string Note(SimLeaf s, Data d)
    {
        if (s.Key[0] == 'a') return "";
        var avg = d.AvgMonths == 1 ? "průměr 1 měsíce" : $"průměr {d.AvgMonths} měsíců";
        if (s.Key == "x") return $"{avg} · převody mimo disponibilní účty";
        if (s.Source is not { } l) return "";
        var recs = l.Recurring;
        string When(RecurringPayment r) => r.Frequency == Frequency.Weekly ? "týdně" : $"{r.AnchorDate.Day}.";
        var fixedText = recs.Count == 1 ? $"{recs[0].Name} · {When(recs[0])}"
            : $"{recs.Count} {(recs.Count < 5 ? "pravidelné platby" : "pravidelných plateb")}";
        if (s.Key[0] == 't') return recs.Count == 1 ? $"převod · {When(recs[0])}" : "převod";
        if (recs.Count > 0) return l.Avg != 0 ? $"{fixedText} + {avg}" : fixedText;
        if (l.Avg != 0 || l.Mtd != 0) return d.AvgMonths == 0 ? "zatím bez historie" : avg;
        return "";
    }

    private static List<TopGroup> Groups(Data d) =>
    [
        .. d.Nodes.Values.Where(n => n.ParentId is null).OrderBy(n => n.Kind).ThenBy(n => n.SortOrder).Select(n => new TopGroup($"c{n.Id}", n.Name, n.Color)),
        new("u", "Nezařazené", "ink-3"),
        new("x", "Spoření a převody", "c11"),
        new("n", "Nové pravidelné", "accent"),
        new("o", "Jednorázové platby", "accent"),
    ];
}

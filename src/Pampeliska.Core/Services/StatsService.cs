using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record StatsFilter(DateRange Range, int? MemberId = null, bool ConfirmedOnly = false, int? AccountId = null);

/// <summary>Jeden „řádek“ statistiky: pohyb nebo část rozdělené platby, v Kč, vážený podílem člena.</summary>
public record FlowLine(int TxId, DateOnly Date, int? CategoryId, CategoryKind Kind, decimal Amount, NeedType Need, bool Confirmed, string Counterparty, int AccountId);

public record CategoryAmount(int? CategoryId, decimal Amount, decimal Previous, int Count);

public record NeedSplit(decimal Need, decimal Joy, decimal None);

public record MonthPoint(string Month, decimal Income, decimal Expense, NeedSplit Needs, IReadOnlyDictionary<int, decimal> ByTopCategory);

public record MerchantAmount(string Name, decimal Amount, int Count, int? CategoryId);

public record OverviewStats(decimal Income, decimal Expense, decimal Balance, decimal? SavingsRate, decimal UnconfirmedExpense,
    decimal? PrevIncome, decimal? PrevExpense, IReadOnlyList<CategoryAmount> ByCategory, NeedSplit Needs, IReadOnlyList<MonthPoint> JoyHistory,
    IReadOnlyList<MerchantAmount> TopMerchants, int TransactionCount);

public record ExpenseTree(IReadOnlyList<CategoryAmount> Categories, decimal Total, decimal PrevTotal, IReadOnlyList<MonthPoint> Months, NeedSplit Needs);

public record TxSummary(decimal Expense, decimal Refunds, decimal Income, int IncomeCount, int Transfers, int Excluded, int Corrections, int Count,
    int Split, int Unconfirmed, int Recurring);

public record TransferSender(int? MemberId, int? FromAccountId, decimal Amount);
public record TransferFlow(int AccountId, decimal Total, IReadOnlyList<TransferSender> Senders);

public record MemberStat(int MemberId, decimal Income, decimal Expense, decimal OwnExpense, decimal JointExpense, decimal IncomeShare, decimal ExpenseShare);
public record MemberCategory(int CategoryId, decimal Total, IReadOnlyDictionary<int, decimal> ByMember);
public record MembersStats(IReadOnlyList<MemberStat> Members, IReadOnlyList<MemberCategory> ByCategory, decimal JointExpense);

/// <summary>
/// Souhrny příjmů a výdajů. Počítají se jen pohyby, které se započítávají (ne převody, korekce a vyřazené),
/// rozdělené platby po částech, u vybraného člena jen jeho podíl. Vratky snižují výdaje ve své kategorii.
/// U vybraného člena se počítají i převody mezi členy (<see cref="Transaction.BetweenMembers"/>): odchozí jako výdaj,
/// příchozí jako příjem, resp. snížení výdaje, když je v kategorii výdajů.
/// </summary>
public class StatsService(AppDbContext db)
{
    public async Task<(List<FlowLine> Lines, List<Category> Categories)> LinesAsync(StatsFilter f)
    {
        var cats = await db.Categories.AsNoTracking().ToListAsync();
        return (await LinesAsync(f, cats), cats);
    }

    public async Task<List<FlowLine>> LinesAsync(StatsFilter f, IReadOnlyCollection<Category> cats)
    {
        var tree = CategoryService.BuildTree(cats).ToDictionary(n => n.Id);
        var byId = cats.ToDictionary(c => c.Id);
        // Převody mezi členy jen v pohledu člena – v domácnosti se vzájemně vyruší
        var member = f.MemberId is not null;
        var q = db.Transactions.AsNoTracking().Include(t => t.Splits).Include(t => t.Shares)
            .Where(t => t.Date >= f.Range.From && t.Date <= f.Range.To && !t.ExcludeFromStats
                        && (t.Kind == TransactionKind.Expense || t.Kind == TransactionKind.Income || t.Kind == TransactionKind.Refund
                            || (member && t.BetweenMembers)));
        if (f.ConfirmedOnly) q = q.Where(t => t.Status == TransactionStatus.Confirmed);
        if (f.AccountId is { } acc) q = q.Where(t => t.AccountId == acc);
        if (f.MemberId is { } mid) q = q.Where(t => t.Shares.Any(s => s.MemberId == mid && s.Percent > 0));
        var txs = await q.ToListAsync();
        var lines = new List<FlowLine>(txs.Count);
        foreach (var t in txs)
        {
            var weight = f.MemberId is { } m ? (t.Shares.FirstOrDefault(s => s.MemberId == m)?.Percent ?? 0) / 100m : 1m;
            if (weight == 0) continue;
            var confirmed = t.Status == TransactionStatus.Confirmed;
            if (t.IsSplit)
            {
                foreach (var s in t.Splits)
                    lines.Add(Line(t, s.CategoryId, Math.Round(s.Amount * t.FxRate * weight, 2), s.NeedOverride, confirmed));
            }
            else lines.Add(Line(t, t.CategoryId, Math.Round(t.AmountCzk * weight, 2), t.NeedOverride, confirmed));
        }
        return lines;

        FlowLine Line(Transaction t, int? cid, decimal amount, NeedType? needOverride, bool confirmed)
        {
            var kind = cid is { } c && byId.TryGetValue(c, out var cat) ? cat.Kind
                : t.Kind == TransactionKind.Income || (t.BetweenMembers && t.Amount > 0) ? CategoryKind.Income : CategoryKind.Expense;
            var need = needOverride is { } n and not NeedType.Inherit ? n
                : cid is { } c2 && tree.TryGetValue(c2, out var node) ? node.EffectiveNeed : NeedType.None;
            return new FlowLine(t.Id, t.Date, cid, kind, amount, need, confirmed, t.Counterparty, t.AccountId);
        }
    }

    /// <summary>Výdaj řádku jako kladné číslo (vratka záporně).</summary>
    public static decimal ExpenseOf(FlowLine l) => l.Kind == CategoryKind.Expense ? -l.Amount : 0;
    public static decimal IncomeOf(FlowLine l) => l.Kind == CategoryKind.Income ? l.Amount : 0;

    public static NeedSplit Needs(IEnumerable<FlowLine> lines)
    {
        decimal n = 0, j = 0, o = 0;
        foreach (var l in lines.Where(l => l.Kind == CategoryKind.Expense))
        {
            var e = ExpenseOf(l);
            if (l.Need == NeedType.Need) n += e;
            else if (l.Need == NeedType.Joy) j += e;
            else o += e;
        }
        return new NeedSplit(n, j, o);
    }

    /// <summary>Součty za kategorii včetně všech potomků (každá úroveň stromu), plus „nezařazené“ (CategoryId null).</summary>
    public static List<CategoryAmount> ByCategory(IReadOnlyCollection<Category> cats, IReadOnlyList<FlowLine> current, IReadOnlyList<FlowLine>? previous,
        CategoryKind kind)
    {
        var parent = cats.ToDictionary(c => c.Id, c => c.ParentId);
        IEnumerable<int> Chain(int id)
        {
            int? c = id;
            while (c is { } x && parent.ContainsKey(x)) { yield return x; c = parent[x]; }
        }
        decimal Value(FlowLine l) => kind == CategoryKind.Expense ? ExpenseOf(l) : IncomeOf(l);
        var cur = new Dictionary<int, (decimal Sum, HashSet<int> Tx)>();
        var prev = new Dictionary<int, decimal>();
        decimal uncCur = 0, uncPrev = 0;
        var uncTx = new HashSet<int>();
        foreach (var l in current.Where(l => l.Kind == kind))
        {
            if (l.CategoryId is not { } cid) { uncCur += Value(l); uncTx.Add(l.TxId); continue; }
            foreach (var a in Chain(cid))
            {
                var e = cur.GetValueOrDefault(a, (0, []));
                e.Tx.Add(l.TxId);
                cur[a] = (e.Sum + Value(l), e.Tx);
            }
        }
        foreach (var l in (previous ?? []).Where(l => l.Kind == kind))
        {
            if (l.CategoryId is not { } cid) { uncPrev += Value(l); continue; }
            foreach (var a in Chain(cid)) prev[a] = prev.GetValueOrDefault(a) + Value(l);
        }
        var result = cats.Where(c => c.Kind == kind)
            .Select(c => new CategoryAmount(c.Id, cur.GetValueOrDefault(c.Id).Sum, prev.GetValueOrDefault(c.Id), cur.GetValueOrDefault(c.Id).Tx?.Count ?? 0))
            .ToList();
        if (uncCur != 0 || uncPrev != 0) result.Add(new CategoryAmount(null, uncCur, uncPrev, uncTx.Count));
        return result;
    }

    public static List<MonthPoint> Months(IReadOnlyCollection<Category> cats, IReadOnlyList<FlowLine> lines, DateRange range)
    {
        var top = new Dictionary<int, int>();
        var parent = cats.ToDictionary(c => c.Id, c => c.ParentId);
        int TopOf(int id)
        {
            if (top.TryGetValue(id, out var t)) return t;
            var c = id;
            while (parent.GetValueOrDefault(c) is { } p) c = p;
            return top[id] = c;
        }
        var result = new List<MonthPoint>();
        for (var m = new DateOnly(range.From.Year, range.From.Month, 1); m <= range.To; m = m.AddMonths(1))
        {
            var ml = lines.Where(l => l.Date.Year == m.Year && l.Date.Month == m.Month).ToList();
            var byTop = ml.Where(l => l.Kind == CategoryKind.Expense && l.CategoryId is not null)
                .GroupBy(l => TopOf(l.CategoryId!.Value)).ToDictionary(g => g.Key, g => g.Sum(ExpenseOf));
            var unc = ml.Where(l => l.Kind == CategoryKind.Expense && l.CategoryId is null).Sum(ExpenseOf);
            if (unc != 0) byTop[0] = unc;
            result.Add(new MonthPoint($"{m:yyyy-MM}", ml.Sum(IncomeOf), ml.Sum(ExpenseOf), Needs(ml), byTop));
        }
        return result;
    }

    public async Task<OverviewStats> OverviewAsync(StatsFilter f, bool compare)
    {
        var (lines, cats) = await LinesAsync(f);
        var prevRange = f.Range.Previous();
        var prev = compare ? await LinesAsync(f with { Range = prevRange }, cats) : null;
        var income = lines.Sum(IncomeOf);
        var expense = lines.Sum(ExpenseOf);
        // Historie podílu „pro radost“: posledních 5 měsíců do konce období
        var histFrom = new DateOnly(f.Range.To.Year, f.Range.To.Month, 1).AddMonths(-4);
        var histLines = await LinesAsync(f with { Range = new DateRange(histFrom, f.Range.To) }, cats);
        var merchants = lines.Where(l => l.Kind == CategoryKind.Expense)
            .GroupBy(l => Text.MerchantKey(l.Counterparty) is { Length: > 0 } k ? k : Text.Normalize(l.Counterparty))
            .Select(g => new MerchantAmount(g.OrderByDescending(x => x.Date).First().Counterparty, g.Sum(ExpenseOf), g.Select(x => x.TxId).Distinct().Count(),
                g.GroupBy(x => x.CategoryId).OrderByDescending(x => x.Sum(ExpenseOf)).First().Key))
            .OrderByDescending(m => m.Amount).Take(10).ToList();
        return new OverviewStats(income, expense, income - expense, income > 0 ? Math.Round((income - expense) / income * 100, 1) : null,
            lines.Where(l => !l.Confirmed).Sum(ExpenseOf), prev?.Sum(IncomeOf), prev?.Sum(ExpenseOf),
            ByCategory(cats, lines, prev, CategoryKind.Expense), Needs(lines), Months(cats, histLines, new DateRange(histFrom, f.Range.To)),
            merchants, lines.Select(l => l.TxId).Distinct().Count());
    }

    public async Task<ExpenseTree> ExpensesAsync(StatsFilter f, bool compare, CategoryKind kind = CategoryKind.Expense)
    {
        var (lines, cats) = await LinesAsync(f);
        var prev = compare ? await LinesAsync(f with { Range = f.Range.Previous() }, cats) : null;
        Func<FlowLine, decimal> val = kind == CategoryKind.Expense ? ExpenseOf : IncomeOf;
        return new ExpenseTree(ByCategory(cats, lines, prev, kind), lines.Sum(val), prev?.Sum(val) ?? 0, Months(cats, lines, f.Range), Needs(lines));
    }

    /// <summary>Souhrnné karty na stránce Pohyby (podle stejných filtrů jako seznam).</summary>
    public async Task<TxSummary> SummaryAsync(DateRange range, int? accountId, int? memberId, bool confirmedOnly = false)
    {
        var q = db.Transactions.AsNoTracking().Include(t => t.Shares).Include(t => t.Splits).Where(t => t.Date >= range.From && t.Date <= range.To);
        if (confirmedOnly) q = q.Where(t => t.Status == TransactionStatus.Confirmed);
        if (accountId is { } a) q = q.Where(t => t.AccountId == a);
        if (memberId is { } m) q = q.Where(t => t.Shares.Any(s => s.MemberId == m && s.Percent > 0));
        var txs = await q.ToListAsync();
        decimal W(Transaction t) => memberId is { } m ? (t.Shares.FirstOrDefault(s => s.MemberId == m)?.Percent ?? 0) / 100m : 1m;
        var counted = txs.Where(t => t.CountsFor(memberId)).ToList();
        // Převod mezi členy (jen v pohledu člena): odchozí jako výdaj, příchozí jako příjem
        bool Out(Transaction t) => t.Kind == TransactionKind.Expense || (t.BetweenMembers && t.Amount < 0);
        bool In(Transaction t) => t.Kind == TransactionKind.Income || (t.BetweenMembers && t.Amount > 0);
        return new TxSummary(
            -counted.Where(Out).Sum(t => t.AmountCzk * W(t)) - counted.Where(t => t.Kind == TransactionKind.Refund).Sum(t => t.AmountCzk * W(t)),
            counted.Where(t => t.Kind == TransactionKind.Refund).Sum(t => t.AmountCzk * W(t)),
            counted.Where(In).Sum(t => t.AmountCzk * W(t)),
            counted.Count(In),
            txs.Count(t => t.Kind is TransactionKind.Transfer or TransactionKind.InvestmentTransfer && !t.CountsFor(memberId)),
            txs.Count(t => t.ExcludeFromStats && t.Kind != TransactionKind.Correction),
            txs.Count(t => t.Kind == TransactionKind.Correction), txs.Count,
            txs.Count(t => t.IsSplit), txs.Count(t => t.Status == TransactionStatus.Suggested), txs.Count(t => t.IsRecurring));
    }

    /// <summary>„Kdo kolik poslal na účty“: příchozí převody podle cílového účtu a odesílatele (vlastník zdrojového účtu).</summary>
    public async Task<List<TransferFlow>> TransferFlowsAsync(DateRange range, int? accountId)
    {
        var incoming = await db.Transactions.AsNoTracking()
            .Where(t => t.Date >= range.From && t.Date <= range.To && t.Amount > 0
                        && (t.Kind == TransactionKind.Transfer || t.Kind == TransactionKind.InvestmentTransfer) && t.TransferPairId != null)
            .Where(t => accountId == null || t.AccountId == accountId)
            .ToListAsync();
        var pairIds = incoming.Select(t => t.TransferPairId!.Value).ToList();
        var sources = await db.Transactions.AsNoTracking().Where(t => pairIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.AccountId);
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id);
        return incoming.GroupBy(t => t.AccountId).Select(g => new TransferFlow(g.Key, g.Sum(t => t.AmountCzk),
            g.GroupBy(t => sources.TryGetValue(t.TransferPairId!.Value, out var src) && accounts.TryGetValue(src, out var sa) ? (sa.OwnerMemberId, sa.OwnerMemberId is null ? (int?)src : null) : (null, null))
                .Select(s => new TransferSender(s.Key.Item1, s.Key.Item2, s.Sum(t => t.AmountCzk))).OrderByDescending(s => s.Amount).ToList()))
            .OrderByDescending(f => f.Total).ToList();
    }

    /// <summary>Členové: příjmy a výdaje (včetně podílu ze společných účtů) a výdaje podle hlavních kategorií.</summary>
    public async Task<MembersStats> MembersAsync(DateRange range, bool confirmedOnly)
    {
        var members = await db.Members.AsNoTracking().OrderBy(m => m.SortOrder).ToListAsync();
        var cats = await db.Categories.AsNoTracking().ToListAsync();
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id);
        var parent = cats.ToDictionary(c => c.Id, c => c.ParentId);
        int Top(int id) { var c = id; while (parent.GetValueOrDefault(c) is { } p) c = p; return c; }
        var stats = new List<MemberStat>();
        var byCat = new Dictionary<int, Dictionary<int, decimal>>();
        decimal joint = 0;
        foreach (var m in members)
        {
            var lines = await LinesAsync(new StatsFilter(range, m.Id, confirmedOnly), cats);
            var inc = lines.Sum(IncomeOf);
            var exp = lines.Sum(ExpenseOf);
            var jointExp = lines.Where(l => accounts.TryGetValue(l.AccountId, out var a) && a.IsJoint).Sum(ExpenseOf);
            stats.Add(new MemberStat(m.Id, inc, exp, exp - jointExp, jointExp, 0, 0));
            foreach (var l in lines.Where(l => l.Kind == CategoryKind.Expense && l.CategoryId is not null))
            {
                var t = Top(l.CategoryId!.Value);
                var d = byCat.TryGetValue(t, out var x) ? x : byCat[t] = [];
                d[m.Id] = d.GetValueOrDefault(m.Id) + ExpenseOf(l);
            }
        }
        var allLines = await LinesAsync(new StatsFilter(range, null, confirmedOnly), cats);
        joint = allLines.Where(l => accounts.TryGetValue(l.AccountId, out var a) && a.IsJoint).Sum(ExpenseOf);
        var totalInc = stats.Sum(s => s.Income);
        var totalExp = stats.Sum(s => s.Expense);
        stats = stats.Select(s => s with
        {
            IncomeShare = totalInc > 0 ? Math.Round(s.Income / totalInc * 100, 1) : 0,
            ExpenseShare = totalExp > 0 ? Math.Round(s.Expense / totalExp * 100, 1) : 0,
        }).ToList();
        return new MembersStats(stats, byCat.Select(kv => new MemberCategory(kv.Key, kv.Value.Values.Sum(), kv.Value))
            .OrderByDescending(c => c.Total).ToList(), joint);
    }
}

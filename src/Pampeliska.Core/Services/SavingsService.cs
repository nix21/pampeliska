using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record JoyMonth(string Month, decimal Joy, decimal Total, decimal Share);
public record JoyCategory(int CategoryId, decimal Amount, decimal Average);
public record JoySubscription(int RecurringId, string Name, int AccountId, int? CategoryId, decimal Amount, string Currency, Frequency Frequency,
    decimal MonthlyCzk, decimal YearlyCzk, DateOnly? NextDue, bool MarkedToCancel, int? OwnerMemberId);
public record SavingsInsight(int CategoryId, int Count, decimal YearlyCzk, IReadOnlyList<string> Names);

public record SavingsOverview(string Month, decimal Joy, decimal JoyShare, decimal JoyYear, IReadOnlyList<JoyMonth> History, decimal AverageShare,
    IReadOnlyList<JoyCategory> TopJoy, IReadOnlyList<JoySubscription> Subscriptions, SavingsInsight? Insight,
    decimal Disposable, decimal MonthlyNet, IReadOnlyList<decimal> Outlook);

/// <summary>Kde ušetřit: výdaje pro radost, pravidelná předplatná pro radost a simulace jejich zrušení.</summary>
public class SavingsService(AppDbContext db, StatsService stats, RecurringService recurring, BalanceService balances, TimeProvider time)
{
    public async Task<SavingsOverview> OverviewAsync(DateOnly month, int? memberId, bool confirmedOnly)
    {
        var range = DateRange.MonthOf(month);
        var cats = await db.Categories.AsNoTracking().ToListAsync();
        var tree = CategoryService.BuildTree(cats).ToDictionary(n => n.Id);
        var histFrom = range.From.AddMonths(-5);
        var lines = await stats.LinesAsync(new StatsFilter(new DateRange(histFrom.AddMonths(-6), range.To), memberId, confirmedOnly), cats);

        var history = new List<JoyMonth>();
        for (var m = histFrom; m <= range.From; m = m.AddMonths(1))
        {
            var r = DateRange.MonthOf(m);
            var ml = lines.Where(l => r.Contains(l.Date)).ToList();
            var joy = StatsService.Needs(ml).Joy;
            var total = ml.Sum(StatsService.ExpenseOf);
            history.Add(new JoyMonth($"{m:yyyy-MM}", joy, total, total > 0 ? Math.Round(joy / total * 100, 1) : 0));
        }
        var current = history[^1];

        var parent = cats.ToDictionary(c => c.Id, c => c.ParentId);
        int Top(int id) { var c = id; while (parent.GetValueOrDefault(c) is { } p && tree.ContainsKey(p) && tree[c].Depth > 1) c = p; return c; }
        var joyLines = lines.Where(l => l.Need == NeedType.Joy && l.Kind == CategoryKind.Expense && l.CategoryId is not null).ToList();
        var prevFrom = range.From.AddMonths(-6);
        var top = joyLines.Where(l => range.Contains(l.Date)).GroupBy(l => Top(l.CategoryId!.Value))
            .Select(g => new JoyCategory(g.Key, g.Sum(StatsService.ExpenseOf),
                Math.Round(joyLines.Where(l => Top(l.CategoryId!.Value) == g.Key && l.Date >= prevFrom && l.Date < range.From).Sum(StatsService.ExpenseOf) / 6, 2)))
            .OrderByDescending(x => x.Amount).Take(5).ToList();

        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id);
        var subs = (await recurring.ListAsync())
            .Where(r => r.Status == RecurringStatus.Active && r.Amount < 0 && !r.IsTransfer && r.CategoryId is { } c && tree.TryGetValue(c, out var n) && n.EffectiveNeed == NeedType.Joy)
            .Where(r => memberId is null || !accounts.TryGetValue(r.AccountId, out var a) || a.OwnerMemberId == memberId || a.IsJoint)
            .Select(r => new JoySubscription(r.Id, r.Name, r.AccountId, r.CategoryId, r.Amount, r.Currency, r.Frequency, -r.MonthlyCzk, -r.YearlyCzk,
                r.NextDue, r.MarkedToCancel, accounts.TryGetValue(r.AccountId, out var a) ? a.OwnerMemberId : null))
            .OrderByDescending(s => s.YearlyCzk).ToList();
        var insight = subs.Where(s => s.CategoryId is not null).GroupBy(s => s.CategoryId!.Value).Where(g => g.Count() >= 3)
            .Select(g => new SavingsInsight(g.Key, g.Count(), g.Sum(s => s.YearlyCzk), g.Select(s => s.Name).ToList())).FirstOrDefault();

        // Výhled 12 měsíců: disponibilní zůstatek + průměrná měsíční bilance za poslední 3 měsíce
        var bal = await balances.BalancesAsync();
        var disposable = accounts.Values.Where(a => !a.Archived && a.IncludeInDisposable && a.Kind != AccountKind.Investment
                                                    && (memberId is null || a.OwnerMemberId == memberId || a.IsJoint))
            .Sum(a => bal.GetValueOrDefault(a.Id)?.BalanceCzk ?? 0);
        var last3 = lines.Where(l => l.Date >= range.From.AddMonths(-3) && l.Date < range.From).ToList();
        var net = Math.Round((last3.Sum(StatsService.IncomeOf) - last3.Sum(StatsService.ExpenseOf)) / 3, 2);
        var outlook = Enumerable.Range(1, 12).Select(i => Math.Round(disposable + net * i, 2)).ToList();

        return new SavingsOverview($"{month:yyyy-MM}", current.Joy, current.Share, current.Joy * 12, history,
            history.Count > 0 ? Math.Round(history.Average(h => h.Share), 1) : 0, top, subs, insight, disposable, net, outlook);
        // time je k dispozici pro budoucí rozšíření (dnešní den v měsíci)
    }

    public async Task MarkToCancelAsync(IReadOnlyDictionary<int, bool> marks)
    {
        var ids = marks.Keys.ToList();
        foreach (var r in await db.RecurringPayments.Where(r => ids.Contains(r.Id)).ToListAsync()) r.MarkedToCancel = marks[r.Id];
        await db.SaveChangesAsync();
        _ = time;
    }
}

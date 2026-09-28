using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum BudgetStatus { NoLimit, OnPace, Faster, WontFit, Over, Paid, Waiting }

public record Reservation(int RecurringId, string Name, DateOnly Date, decimal Amount);

public record BudgetLine(int CategoryId, int? ParentId, int Depth, string Name, BudgetPeriod Period, decimal? Limit, decimal? OwnLimit,
    decimal ChildSum, bool CarryOver, decimal CarriedIn, decimal CarryOut, decimal Spent, decimal? MemberSpent, decimal Reserved,
    IReadOnlyList<Reservation> Reservations, BudgetStatus Status, NeedSplit Needs, bool IsFixed, bool Personal, decimal Free);

public record BudgetOverview(string Month, bool Closed, int Day, int DaysInMonth, decimal Pace, decimal Total, decimal Spent, decimal? MemberSpent,
    decimal Reserved, decimal Free, IReadOnlyList<BudgetLine> Monthly, IReadOnlyList<BudgetLine> Yearly, decimal YearPace);

public record BudgetSeries(IReadOnlyList<decimal> Cumulative, decimal? Limit, decimal Projection, int Day, int DaysInMonth);

public record BudgetInput(int CategoryId, int? MemberId, BudgetPeriod Period, decimal? Amount, bool? CarryOver);

/// <summary>
/// Rozpočty: limit domácnosti na kategorii (Category.Budget*) a osobní limity členů (MemberBudget). Efektivní limit = vlastní,
/// jinak součet podkategorií. Rezervace = očekávané pravidelné platby do konce období. Přenos nevyčerpaného se počítá dynamicky.
/// </summary>
public class BudgetService(AppDbContext db, StatsService stats, RecurringService recurring, TimeProvider time)
{
    public const decimal FasterMargin = 4m;

    public async Task<BudgetOverview> OverviewAsync(DateOnly month, int? memberId, bool confirmedOnly)
    {
        var today = time.Today();
        var range = DateRange.MonthOf(month);
        var closed = range.To < today;
        var day = closed ? range.Days : Math.Clamp(today.Day, 1, range.Days);
        var pace = closed ? 100m : Math.Round(day * 100m / range.Days, 1);
        var cats = await db.Categories.AsNoTracking().Where(c => c.Kind == CategoryKind.Expense).ToListAsync();
        var allCats = await db.Categories.AsNoTracking().ToListAsync();
        var tree = CategoryService.BuildTree(cats);
        var personal = memberId is { } mid
            ? await db.MemberBudgets.AsNoTracking().Where(b => b.MemberId == mid).ToDictionaryAsync(b => b.CategoryId)
            : [];

        // Útrata: celá domácnost i podíl vybraného člena, 12 měsíců zpět kvůli přenosu
        var histFrom = range.From.AddMonths(-12);
        var allLines = await stats.LinesAsync(new StatsFilter(new DateRange(histFrom, range.To), null, confirmedOnly), allCats);
        var memberLines = memberId is null ? null : await stats.LinesAsync(new StatsFilter(new DateRange(histFrom, range.To), memberId, confirmedOnly), allCats);

        var reservations = await ReservationsAsync(today > range.From ? today.AddDays(1) : range.From, range.To, cats);
        var yearRange = DateRange.Year(month.Year);
        var yearReservations = await ReservationsAsync(today > yearRange.From ? today.AddDays(1) : yearRange.From, yearRange.To, cats);

        decimal Spent(IReadOnlyList<FlowLine> lines, HashSet<int> ids, DateRange r) =>
            lines.Where(l => l.CategoryId is { } c && ids.Contains(c) && r.Contains(l.Date)).Sum(StatsService.ExpenseOf);

        var descendants = cats.ToDictionary(c => c.Id, c => CategoryService.WithDescendants(cats, c.Id));
        var byId = cats.ToDictionary(c => c.Id);
        var children = cats.ToLookup(c => c.ParentId);

        // Limit (vlastní nebo osobní) pro kategorii a periodu
        (decimal? own, bool isPersonal) OwnLimit(Category c, BudgetPeriod period)
        {
            if (memberId is not null && personal.TryGetValue(c.Id, out var pb) && pb.Period == period) return (pb.Amount, true);
            return (c.BudgetPeriod == period ? c.BudgetAmount : null, false);
        }
        decimal ChildSum(Category c, BudgetPeriod period) =>
            children[c.Id].Sum(ch => OwnLimit(ch, period).own ?? ChildSum(ch, period));
        decimal? Effective(Category c, BudgetPeriod period)
        {
            var own = OwnLimit(c, period).own;
            if (own is not null) return own;
            var sum = ChildSum(c, period);
            return sum > 0 ? sum : null;
        }
        bool Carry(Category c) => memberId is not null && personal.TryGetValue(c.Id, out var pb) ? pb.CarryOver : c.CarryOver;

        decimal CarriedIn(Category c, IReadOnlyList<FlowLine> lines)
        {
            if (!Carry(c) || OwnLimit(c, BudgetPeriod.Monthly).own is not { } limit) return 0;
            decimal carry = 0;
            for (var m = range.From.AddMonths(-11); m < range.From; m = m.AddMonths(1))
            {
                var spent = Spent(lines, descendants[c.Id], DateRange.MonthOf(m));
                carry = Math.Max(0, limit + carry - spent);
            }
            return carry;
        }

        var monthly = new List<BudgetLine>();
        var yearly = new List<BudgetLine>();
        foreach (var node in tree)
        {
            var c = byId[node.Id];
            var lines = memberLines ?? allLines;
            // Měsíční: kategorie s měsíčním limitem nebo s podkategoriemi s limitem
            var mLimit = Effective(c, BudgetPeriod.Monthly);
            if (mLimit is not null)
            {
                var (own, isPersonal) = OwnLimit(c, BudgetPeriod.Monthly);
                var carried = CarriedIn(c, lines);
                var spentAll = Spent(allLines, descendants[c.Id], range);
                var spentMember = memberLines is null ? (decimal?)null : Spent(memberLines, descendants[c.Id], range);
                var spent = isPersonal ? spentMember!.Value : spentAll;
                var res = reservations.Where(r => r.CategoryId is { } rc && descendants[c.Id].Contains(rc)).Select(r => r.Reservation).ToList();
                var reserved = closed ? 0 : res.Sum(r => r.Amount);
                var limit = mLimit.Value + carried;
                var needs = StatsService.Needs(lines.Where(l => l.CategoryId is { } lc && descendants[c.Id].Contains(lc) && range.Contains(l.Date)));
                monthly.Add(new BudgetLine(c.Id, c.ParentId, node.Depth, c.Name, BudgetPeriod.Monthly, limit, own, ChildSum(c, BudgetPeriod.Monthly), Carry(c),
                    carried, Math.Max(0, limit - spent), spent, spentMember, reserved, closed ? [] : res,
                    Status(c.IsFixed, limit, spent, reserved, pace), needs, c.IsFixed, isPersonal, limit - spent - reserved));
            }
            var yLimit = OwnLimit(c, BudgetPeriod.Yearly).own;
            if (yLimit is { } yl)
            {
                var spentAll = Spent(allLines.Concat(Array.Empty<FlowLine>()).ToList(), descendants[c.Id], new DateRange(yearRange.From, range.To));
                var spentMember = memberLines is null ? (decimal?)null : Spent(memberLines, descendants[c.Id], new DateRange(yearRange.From, range.To));
                var isPersonal = OwnLimit(c, BudgetPeriod.Yearly).isPersonal;
                var spent = isPersonal ? spentMember!.Value : spentAll;
                var res = yearReservations.Where(r => r.CategoryId is { } rc && descendants[c.Id].Contains(rc)).Select(r => r.Reservation).ToList();
                var yearPace = Math.Round((range.To.DayOfYear) * 100m / (DateTime.IsLeapYear(month.Year) ? 366 : 365), 1);
                yearly.Add(new BudgetLine(c.Id, c.ParentId, 0, c.Name, BudgetPeriod.Yearly, yl, yl, 0, false, 0, 0, spent, spentMember, res.Sum(r => r.Amount), res,
                    Status(c.IsFixed, yl, spent, res.Sum(r => r.Amount), yearPace), StatsService.Needs([]), c.IsFixed, isPersonal, yl - spent - res.Sum(r => r.Amount)));
            }
        }
        var tops = monthly.Where(l => l.ParentId is null || !monthly.Any(p => p.CategoryId == l.ParentId)).ToList();
        var total = tops.Sum(l => l.Limit ?? 0);
        var spentTotal = tops.Sum(l => l.Spent);
        var reservedTotal = tops.Sum(l => l.Reserved);
        return new BudgetOverview($"{month:yyyy-MM}", closed, day, range.Days, pace, total, spentTotal,
            memberLines is null ? null : tops.Sum(l => l.MemberSpent ?? 0), reservedTotal, total - spentTotal - reservedTotal, monthly, yearly,
            Math.Round(range.To.DayOfYear * 100m / (DateTime.IsLeapYear(month.Year) ? 366 : 365), 1));
    }

    public static BudgetStatus Status(bool isFixed, decimal? limit, decimal spent, decimal reserved, decimal pace)
    {
        if (limit is not { } l || l <= 0) return BudgetStatus.NoLimit;
        if (isFixed) return spent > l ? BudgetStatus.Over : spent > 0 ? BudgetStatus.Paid : BudgetStatus.Waiting;
        if (spent > l) return BudgetStatus.Over;
        if (spent + reserved > l) return BudgetStatus.WontFit;
        if (spent / l * 100 > pace + FasterMargin) return BudgetStatus.Faster;
        return BudgetStatus.OnPace;
    }

    private async Task<List<(int? CategoryId, Reservation Reservation)>> ReservationsAsync(DateOnly from, DateOnly to, List<Category> cats)
    {
        if (to < from) return [];
        var occ = await recurring.OccurrencesAsync(from, to);
        var recs = await db.RecurringPayments.AsNoTracking().ToDictionaryAsync(r => r.Id);
        return occ.Where(o => o.State == OccurrenceState.Expected && o.Amount < 0 && recs.TryGetValue(o.RecurringId, out var r) && !r.IsTransfer)
            .Select(o => (recs[o.RecurringId].CategoryId, new Reservation(o.RecurringId, recs[o.RecurringId].Name, o.Due, -o.AmountCzk))).ToList();
    }

    /// <summary>Denní kumulativní útrata kategorie v měsíci (graf „Čerpání v čase“).</summary>
    public async Task<BudgetSeries> SeriesAsync(int categoryId, DateOnly month, int? memberId, bool confirmedOnly)
    {
        var range = DateRange.MonthOf(month);
        var today = time.Today();
        var (lines, cats) = await stats.LinesAsync(new StatsFilter(range, memberId, confirmedOnly));
        var ids = CategoryService.WithDescendants(cats, categoryId);
        var byDay = lines.Where(l => l.CategoryId is { } c && ids.Contains(c)).GroupBy(l => l.Date.Day).ToDictionary(g => g.Key, g => g.Sum(StatsService.ExpenseOf));
        var lastDay = range.To < today ? range.Days : Math.Min(range.Days, today.Day);
        var cum = new List<decimal>();
        decimal sum = 0;
        for (var d = 1; d <= lastDay; d++) { sum += byDay.GetValueOrDefault(d); cum.Add(sum); }
        var overview = await OverviewAsync(month, memberId, confirmedOnly);
        var limit = overview.Monthly.FirstOrDefault(l => l.CategoryId == categoryId)?.Limit;
        var projection = lastDay > 0 ? sum / lastDay * range.Days : 0;
        return new BudgetSeries(cum, limit, Math.Round(projection, 2), lastDay, range.Days);
    }

    /// <summary>Nastaví limit domácnosti (MemberId null) nebo osobní limit člena. Amount null = zrušit limit.</summary>
    public async Task SetAsync(BudgetInput input)
    {
        var c = await db.Categories.FindAsync(input.CategoryId) ?? throw new DomainException($"Kategorie {input.CategoryId} neexistuje.");
        if (c.Kind != CategoryKind.Expense) throw new DomainException("Rozpočet lze nastavit jen u výdajových kategorií.");
        if (input.Amount is < 0) throw new DomainException("Rozpočet nesmí být záporný.");
        if (input.MemberId is { } mid)
        {
            if (!await db.Members.AnyAsync(m => m.Id == mid)) throw new DomainException($"Člen {mid} neexistuje.");
            var b = await db.MemberBudgets.FirstOrDefaultAsync(x => x.CategoryId == c.Id && x.MemberId == mid);
            if (input.Amount is null || input.Period == BudgetPeriod.None)
            {
                if (b is not null) db.MemberBudgets.Remove(b);
            }
            else
            {
                if (b is null) db.MemberBudgets.Add(b = new MemberBudget { CategoryId = c.Id, MemberId = mid });
                b.Amount = input.Amount.Value;
                b.Period = input.Period;
                if (input.CarryOver is { } co) b.CarryOver = co;
            }
        }
        else
        {
            if (input.Amount is null || input.Period == BudgetPeriod.None)
            {
                c.BudgetAmount = null;
                c.BudgetPeriod = BudgetPeriod.None;
            }
            else
            {
                c.BudgetAmount = input.Amount;
                c.BudgetPeriod = input.Period;
            }
            if (input.CarryOver is { } co) c.CarryOver = co;
        }
        await db.SaveChangesAsync();
    }
}

using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>Kalendář výskytů pravidelné platby a párování pohybu s ní (čisté funkce).</summary>
public static class RecurringSchedule
{
    public static int PeriodDays(Frequency f) => f switch
    {
        Frequency.Weekly => 7,
        Frequency.Monthly => 30,
        Frequency.Quarterly => 91,
        _ => 365,
    };

    /// <summary>Očekávaná data výskytů v intervalu (včetně), odvozená od <see cref="RecurringPayment.AnchorDate"/>.</summary>
    public static IEnumerable<DateOnly> Occurrences(RecurringPayment r, DateOnly from, DateOnly to)
    {
        if (to < from) yield break;
        var end = r.EndedAt is { } e && e < to ? e : to;
        if (r.Frequency == Frequency.Weekly)
        {
            var diff = from.DayNumber - r.AnchorDate.DayNumber;
            var k = diff <= 0 ? 0 : (diff + 6) / 7;
            for (var d = r.AnchorDate.AddDays(k * 7); d <= end; d = d.AddDays(7))
                if (d >= from) yield return d;
            yield break;
        }
        var step = r.Frequency switch { Frequency.Monthly => 1, Frequency.Quarterly => 3, _ => 12 };
        var day = r.AnchorDate.Day;
        // Najít první výskyt ≥ from (i před kotvou – kotva je jen fáze kalendáře)
        var months = (from.Year - r.AnchorDate.Year) * 12 + from.Month - r.AnchorDate.Month;
        var n = (int)Math.Floor(months / (double)step) - 1;
        for (var i = n; ; i++)
        {
            var baseDate = new DateOnly(r.AnchorDate.Year, r.AnchorDate.Month, 1).AddMonths(i * step);
            var d = new DateOnly(baseDate.Year, baseDate.Month, Math.Min(day, DateTime.DaysInMonth(baseDate.Year, baseDate.Month)));
            if (d > end) yield break;
            if (d >= from) yield return d;
        }
    }

    /// <summary>Nejbližší očekávaný výskyt k datu (v okně ± tolerance).</summary>
    public static DateOnly? NearestOccurrence(RecurringPayment r, DateOnly date) =>
        Occurrences(r, date.AddDays(-r.ToleranceDays), date.AddDays(r.ToleranceDays))
            .OrderBy(d => Math.Abs(d.DayNumber - date.DayNumber)).Cast<DateOnly?>().FirstOrDefault();

    public static bool PatternMatches(RecurringPayment r, Transaction t)
    {
        var p = Text.Normalize(r.MatchPattern);
        if (p.Length == 0) return Math.Abs(t.Amount - r.Amount) < 0.005m;
        return RuleEngine.MerchantText(t).Contains(p);
    }

    /// <summary>Pravidelná platba, ke které pohyb patří (stejný směr, text, termín v toleranci).</summary>
    public static RecurringPayment? FindMatch(IEnumerable<RecurringPayment> candidates, Transaction t) =>
        candidates
            .Where(r => r.AccountId == t.AccountId && r.Status == RecurringStatus.Active && Math.Sign(r.Amount) == Math.Sign(t.Amount)
                        && PatternMatches(r, t) && NearestOccurrence(r, t.Date) is not null)
            .OrderBy(r => Math.Abs(Math.Abs(r.Amount) - Math.Abs(t.Amount)))
            .FirstOrDefault();

    /// <summary>Měsíční ekvivalent částky (pro souhrny „měsíčně odchází“).</summary>
    public static decimal MonthlyEquivalent(RecurringPayment r) => r.Frequency switch
    {
        Frequency.Weekly => r.Amount * 52 / 12,
        Frequency.Monthly => r.Amount,
        Frequency.Quarterly => r.Amount / 3,
        _ => r.Amount / 12,
    };

    public static decimal YearlyEquivalent(RecurringPayment r) => MonthlyEquivalent(r) * 12;
}

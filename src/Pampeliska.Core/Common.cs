using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Pampeliska.Core;

/// <summary>Uzavřený interval dnů (od–do včetně).</summary>
public readonly record struct DateRange(DateOnly From, DateOnly To)
{
    public bool Contains(DateOnly d) => d >= From && d <= To;
    public int Days => To.DayNumber - From.DayNumber + 1;

    public static DateRange Month(int year, int month) =>
        new(new DateOnly(year, month, 1), new DateOnly(year, month, DateTime.DaysInMonth(year, month)));

    public static DateRange MonthOf(DateOnly d) => Month(d.Year, d.Month);

    public static DateRange Quarter(int year, int q) =>
        new(new DateOnly(year, (q - 1) * 3 + 1, 1), new DateOnly(year, q * 3, DateTime.DaysInMonth(year, q * 3)));

    public static DateRange Year(int year) => new(new DateOnly(year, 1, 1), new DateOnly(year, 12, 31));

    /// <summary>Stejně dlouhé předchozí období (měsíc → předchozí měsíc, rok → předchozí rok, jinak posun o délku).</summary>
    public DateRange Previous()
    {
        if (From.Day == 1 && To == From.AddMonths(1).AddDays(-1)) return MonthOf(From.AddMonths(-1));
        if (From.Day == 1 && From.Month % 3 == 1 && To == From.AddMonths(3).AddDays(-1))
            return new(From.AddMonths(-3), From.AddDays(-1));
        if (From is { Day: 1, Month: 1 } && To == From.AddYears(1).AddDays(-1)) return Year(From.Year - 1);
        return new(From.AddDays(-Days), From.AddDays(-1));
    }

    /// <summary>Parsuje „2026-09“, „2026-Q3“, „2026“ nebo „2026-04-01..2026-09-28“.</summary>
    public static DateRange Parse(string value)
    {
        value = value.Trim();
        if (value.Contains(".."))
        {
            var p = value.Split("..");
            return new(DateOnly.Parse(p[0], CultureInfo.InvariantCulture), DateOnly.Parse(p[1], CultureInfo.InvariantCulture));
        }
        var q = Regex.Match(value, @"^(\d{4})-Q([1-4])$", RegexOptions.IgnoreCase);
        if (q.Success) return Quarter(int.Parse(q.Groups[1].Value), int.Parse(q.Groups[2].Value));
        var m = Regex.Match(value, @"^(\d{4})-(\d{1,2})$");
        if (m.Success) return Month(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value));
        if (Regex.IsMatch(value, @"^\d{4}$")) return Year(int.Parse(value));
        throw new Domain.DomainException($"Neplatné období „{value}“ (očekáváno 2026-09, 2026-Q3, 2026 nebo od..do).");
    }

    public override string ToString() => $"{From:yyyy-MM-dd}..{To:yyyy-MM-dd}";
}

public static class Clock
{
    private static readonly TimeZoneInfo Prague = FindPrague();

    private static TimeZoneInfo FindPrague()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Local; }
    }

    public static DateOnly Today(this TimeProvider time) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), Prague).DateTime);
}

public static class Text
{
    /// <summary>Malá písmena bez diakritiky a se sjednocenými mezerami – pro porovnávání obchodníků.</summary>
    public static string Normalize(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var d = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        var space = false;
        foreach (var ch in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsWhiteSpace(ch)) { space = sb.Length > 0; continue; }
            if (space) { sb.Append(' '); space = false; }
            sb.Append(char.ToLowerInvariant(ch));
        }
        return sb.ToString();
    }

    /// <summary>Klíč obchodníka pro návrhy pravidel: první dvě „slova“ bez čísel a interpunkce.</summary>
    public static string MerchantKey(string? counterparty)
    {
        var n = Normalize(counterparty);
        var words = Regex.Split(n, @"[^a-z0-9.]+").Where(w => w.Length > 1 && !Regex.IsMatch(w, @"^\d+$")).Take(2);
        return string.Join(' ', words);
    }

    /// <summary>Jsou si protistrany podobné (jedna obsahuje druhou nebo sdílí první slovo)?</summary>
    public static bool Similar(string? a, string? b)
    {
        var x = Normalize(a);
        var y = Normalize(b);
        if (x.Length == 0 || y.Length == 0) return x.Length == y.Length;
        if (x.Contains(y) || y.Contains(x)) return true;
        var fx = x.Split(' ')[0];
        var fy = y.Split(' ')[0];
        return fx.Length >= 3 && fx == fy;
    }
}

public static class AccountNumber
{
    /// <summary>
    /// Kanonický tvar čísla účtu pro porovnání: „prefix-číslo/banka“ bez úvodních nul (CZ IBAN se převede),
    /// jinak jen velká písmena bez mezer.
    /// </summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var v = Regex.Replace(value, @"\s+", "").ToUpperInvariant();
        var iban = Regex.Match(v, @"^CZ\d{2}(\d{4})(\d{6})(\d{10})$");
        if (iban.Success) return Canon(iban.Groups[2].Value, iban.Groups[3].Value, iban.Groups[1].Value);
        var cz = Regex.Match(v, @"^(?:(\d{1,6})-)?(\d{2,10})/(\d{4})$");
        if (cz.Success) return Canon(cz.Groups[1].Value, cz.Groups[2].Value, cz.Groups[3].Value);
        // Předčíslí bez pomlčky („0000192000145399/0800“, „192000145399/0800“): posledních 10 číslic je číslo účtu
        var joined = Regex.Match(v, @"^(\d{1,6})(\d{10})/(\d{4})$");
        if (joined.Success) return Canon(joined.Groups[1].Value, joined.Groups[2].Value, joined.Groups[3].Value);
        return v;
    }

    private static string Canon(string prefix, string number, string bank)
    {
        var p = prefix.TrimStart('0');
        var n = number.TrimStart('0');
        return (p.Length > 0 ? p + "-" : "") + n + "/" + bank;
    }

    /// <summary>Kód banky z čísla účtu nebo CZ IBAN (pro rozlišení „stejný bankovní dům“).</summary>
    public static string? BankCode(string? value) =>
        Normalize(value) is { } n && n.Contains('/') ? n[(n.IndexOf('/') + 1)..] : null;

    public static bool Same(string? a, string? b) =>
        Normalize(a) is { } x && Normalize(b) is { } y && x == y;
}

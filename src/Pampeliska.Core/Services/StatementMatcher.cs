using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>
/// Párování pohybů z výpisu s předběžnými pohyby z e-mailových notifikací (docs/email-notifikace.md kap. 4).
/// Notifikace přijde v den platby, výpis má datum zaúčtování (u karet o dny později) a u cizí měny i jinou částku.
/// </summary>
public static class StatementMatcher
{
    /// <summary>O kolik dní dřív než zaúčtování ve výpisu může být notifikace (blokace karty).</summary>
    public const int DaysBefore = 7;
    /// <summary>O kolik dní později může být notifikace (výjimečně, např. jiné datum odeslání).</summary>
    public const int DaysAfter = 2;
    /// <summary>Tolerance částky u karetních plateb (přepočet měny mezi blokací a zaúčtováním).</summary>
    public const decimal AmountTolerance = 0.03m;
    /// <summary>
    /// Předběžné pohyby z posledních dní období výpisu se ještě nehodnotí – zaúčtovat se můžou až v dalším výpisu.
    /// Stejné jako <see cref="DaysBefore"/>, aby to platilo i pro výpis nahraný po částech.
    /// </summary>
    public const int TailDays = DaysBefore;

    public record Candidate(int Id, DateOnly Date, decimal Amount, string Counterparty, PaymentType PaymentType);

    /// <summary>
    /// Najde předběžný pohyb pro řádek výpisu: stejná částka v okně dnů (přednost podobné protistraně a bližšímu datu),
    /// jinak u karetní platby částka do 3 % s podobnou protistranou.
    /// </summary>
    public static int? Match(ImportItem item, IEnumerable<Candidate> candidates)
    {
        var window = candidates.Where(c => c.Date.DayNumber >= item.Date.DayNumber - DaysBefore && c.Date.DayNumber <= item.Date.DayNumber + DaysAfter
                                           && Math.Sign(c.Amount) == Math.Sign(item.Amount)).ToList();
        int Distance(Candidate c) => Math.Abs(c.Date.DayNumber - item.Date.DayNumber);

        var exact = window.Where(c => c.Amount == item.Amount)
            .OrderByDescending(c => Text.Similar(c.Counterparty, item.Counterparty)).ThenBy(Distance).FirstOrDefault();
        if (exact is not null) return exact.Id;

        var card = item.PaymentType == PaymentType.Card;
        return window.Where(c => (card || c.PaymentType == PaymentType.Card)
                                 && Math.Abs(c.Amount - item.Amount) <= Math.Abs(item.Amount) * AmountTolerance
                                 && Text.Similar(c.Counterparty, item.Counterparty))
            .OrderBy(c => Math.Abs(c.Amount - item.Amount)).ThenBy(Distance).FirstOrDefault()?.Id;
    }

    /// <summary>
    /// Má se předběžný pohyb po importu výpisu za [from, to] označit „Není ve výpisu“? Jen uvnitř období a ne v posledních
    /// <see cref="TailDays"/> dnech; spodní okraj o <see cref="DaysBefore"/> dřív zachytí pohyby z konce předchozího období.
    /// </summary>
    public static bool IsMissing(DateOnly date, DateOnly from, DateOnly to) =>
        date <= to.AddDays(-TailDays) && date >= from.AddDays(-DaysBefore);
}

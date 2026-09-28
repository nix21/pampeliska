using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record AccountBalance(int AccountId, decimal Balance, string Currency, decimal BalanceCzk);

/// <summary>
/// Zůstatky: počáteční zůstatek platí na konci dne <see cref="Account.OpeningDate"/>; pohyby po něm se přičítají,
/// pohyby před ním (starší historie) se odečítají. Investiční účet = poslední zadaná hodnota.
/// </summary>
public class BalanceService(AppDbContext db, FxService fx, TimeProvider time)
{
    public static decimal BalanceFrom(Account a, IEnumerable<(DateOnly Date, decimal Amount)> txs, DateOnly date)
    {
        decimal after = 0, uptoOpening = 0;
        foreach (var (d, amt) in txs)
        {
            if (d <= date) after += amt;
            if (d <= a.OpeningDate) uptoOpening += amt;
        }
        return a.OpeningBalance + after - uptoOpening;
    }

    public static async Task<decimal> BalanceAtAsync(AppDbContext db, Account a, DateOnly date)
    {
        if (a.Kind == AccountKind.Investment) return await InvestmentValueAtAsync(db, a, date);
        var sums = await db.Transactions.AsNoTracking().Where(t => t.AccountId == a.Id)
            .GroupBy(t => 1)
            .Select(g => new
            {
                UpTo = g.Where(t => t.Date <= date).Sum(t => t.Amount),
                UpToOpening = g.Where(t => t.Date <= a.OpeningDate).Sum(t => t.Amount),
            }).FirstOrDefaultAsync();
        return a.OpeningBalance + (sums?.UpTo ?? 0) - (sums?.UpToOpening ?? 0);
    }

    public static async Task<decimal> InvestmentValueAtAsync(AppDbContext db, Account a, DateOnly date)
    {
        var v = await db.InvestmentValues.AsNoTracking().Where(x => x.AccountId == a.Id && x.Date <= date)
            .OrderByDescending(x => x.Date).FirstOrDefaultAsync();
        return v?.Value ?? a.OpeningBalance;
    }

    /// <summary>Zůstatky všech (nearchivovaných) účtů k datu, v měně účtu i v Kč posledním kurzem.</summary>
    public async Task<Dictionary<int, AccountBalance>> BalancesAsync(DateOnly? at = null, bool includeArchived = false)
    {
        var date = at ?? time.Today();
        var accounts = await db.Accounts.AsNoTracking().Where(a => includeArchived || !a.Archived).ToListAsync();
        var ids = accounts.Select(a => a.Id).ToList();
        var txs = (await db.Transactions.AsNoTracking().Where(t => ids.Contains(t.AccountId))
                .Select(t => new { t.AccountId, t.Date, t.Amount }).ToListAsync())
            .ToLookup(t => t.AccountId, t => (t.Date, t.Amount));
        var values = (await db.InvestmentValues.AsNoTracking().Where(v => ids.Contains(v.AccountId) && v.Date <= date).ToListAsync())
            .GroupBy(v => v.AccountId).ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.Date).First().Value);
        var rates = await fx.LatestAsync(date);
        return accounts.ToDictionary(a => a.Id, a =>
        {
            var bal = a.Kind == AccountKind.Investment ? values.GetValueOrDefault(a.Id, a.OpeningBalance) : BalanceFrom(a, txs[a.Id], date);
            return new AccountBalance(a.Id, bal, a.Currency, Math.Round(bal * rates.GetValueOrDefault(a.Currency, 1m), 2));
        });
    }

    /// <summary>Řada zůstatků po týdnech (posledních <paramref name="weeks"/> týdnů, poslední bod = dnes).</summary>
    public async Task<List<(DateOnly Date, decimal Balance)>> WeeklySeriesAsync(Account a, int weeks = 13)
    {
        var today = time.Today();
        var points = Enumerable.Range(0, weeks).Select(i => today.AddDays(-7 * (weeks - 1 - i))).ToList();
        if (a.Kind == AccountKind.Investment)
        {
            var vals = await db.InvestmentValues.AsNoTracking().Where(v => v.AccountId == a.Id).OrderBy(v => v.Date).ToListAsync();
            return points.Select(d => (d, vals.LastOrDefault(v => v.Date <= d)?.Value ?? a.OpeningBalance)).ToList();
        }
        var txs = (await db.Transactions.AsNoTracking().Where(t => t.AccountId == a.Id).Select(t => new { t.Date, t.Amount }).ToListAsync())
            .Select(t => (t.Date, t.Amount)).ToList();
        return points.Select(d => (d, BalanceFrom(a, txs, d))).ToList();
    }

    /// <summary>Denní zůstatky v intervalu (pro průměrný zůstatek a grafy).</summary>
    public static List<decimal> DailyBalances(Account a, IReadOnlyList<(DateOnly Date, decimal Amount)> txs, DateRange range)
    {
        var start = BalanceFrom(a, txs, range.From.AddDays(-1));
        var byDay = txs.Where(t => range.Contains(t.Date)).GroupBy(t => t.Date).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        var result = new List<decimal>(range.Days);
        var bal = start;
        for (var d = range.From; d <= range.To; d = d.AddDays(1))
        {
            bal += byDay.GetValueOrDefault(d);
            result.Add(bal);
        }
        return result;
    }
}

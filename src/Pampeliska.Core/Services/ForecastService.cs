using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record ForecastEvent(DateOnly Date, int RecurringId, string Name, decimal Amount, decimal BalanceAfter);

public record AccountForecast(int AccountId, string Currency, decimal Now, decimal End, decimal Min, DateOnly MinDate, decimal? Limit, bool Low,
    decimal? TopUp, DateOnly? TopUpBy, IReadOnlyList<ForecastEvent> Events, int HorizonDays);

public record PaydayForecast(DateOnly? Payday, string? PaydayName, decimal Disposable, decimal Outgoing, decimal Remaining);

/// <summary>
/// Výhled zůstatku: aktuální zůstatek + očekávané pravidelné platby (bez odhadu běžné útraty). Když výhled klesne
/// pod limit účtu, účet je „k doplnění“ s částkou (zaokrouhleno nahoru na tisíce) a datem.
/// </summary>
public class ForecastService(AppDbContext db, BalanceService balances, RecurringService recurring, FxService fx, TimeProvider time)
{
    public static AccountForecast Compute(Account a, decimal now, IEnumerable<(DateOnly Due, int Id, string Name, decimal Amount)> occurrences,
        DateOnly today, int horizon)
    {
        var bal = now;
        var min = now;
        var minDate = today;
        var events = new List<ForecastEvent>();
        foreach (var o in occurrences.Where(o => o.Due > today && o.Due <= today.AddDays(horizon)).OrderBy(o => o.Due).ThenBy(o => o.Amount))
        {
            bal += o.Amount;
            events.Add(new ForecastEvent(o.Due, o.Id, o.Name, o.Amount, bal));
            if (bal < min) { min = bal; minDate = o.Due; }
        }
        var limit = a.LowBalanceLimit;
        var low = limit is { } l && min < l;
        decimal? topUp = low ? Math.Ceiling((limit!.Value - min) / 1000m) * 1000m : null;
        return new AccountForecast(a.Id, a.Currency, now, bal, min, minDate, limit, low, topUp, low ? minDate : null, events, horizon);
    }

    public async Task<List<AccountForecast>> ForecastAsync(int horizon = 30, int? accountId = null)
    {
        horizon = Math.Clamp(horizon, 7, 366);
        var today = time.Today();
        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => !a.Archived && a.Kind != AccountKind.Investment && (accountId == null || a.Id == accountId)).ToListAsync();
        var bal = await balances.BalancesAsync(today);
        var occ = await recurring.OccurrencesAsync(today.AddDays(1), today.AddDays(horizon));
        var names = await db.RecurringPayments.AsNoTracking().ToDictionaryAsync(r => r.Id, r => (r.Name, r.AccountId));
        return accounts.Select(a => Compute(a, bal.GetValueOrDefault(a.Id)?.Balance ?? a.OpeningBalance,
            occ.Where(o => o.State == OccurrenceState.Expected && names.GetValueOrDefault(o.RecurringId).AccountId == a.Id)
                .Select(o => (o.Due, o.RecurringId, names[o.RecurringId].Name, o.Amount)), today, horizon)).ToList();
    }

    /// <summary>„Po platbách do výplaty 10. 10. zbude X“ – přes účty zahrnuté do disponibilního zůstatku.</summary>
    public async Task<PaydayForecast> UntilPaydayAsync(int? memberId = null)
    {
        var today = time.Today();
        var accounts = await db.Accounts.AsNoTracking().Include(a => a.Shares)
            .Where(a => !a.Archived && a.IncludeInDisposable && a.Kind != AccountKind.Investment).ToListAsync();
        if (memberId is { } m) accounts = accounts.Where(a => a.OwnerMemberId == m || a.IsJoint).ToList();
        var ids = accounts.Select(a => a.Id).ToHashSet();
        var bal = await balances.BalancesAsync(today);
        var rates = await fx.LatestAsync(today);
        decimal Weight(Account a) => memberId is { } mm && a.IsJoint ? ShareService.RatioAt(a, today).GetValueOrDefault(mm) / 100m : 1m;
        var disposable = accounts.Sum(a => (bal.GetValueOrDefault(a.Id)?.BalanceCzk ?? 0) * Weight(a));
        var occ = (await recurring.OccurrencesAsync(today.AddDays(1), today.AddDays(40))).Where(o => o.State == OccurrenceState.Expected).ToList();
        var recs = await db.RecurringPayments.AsNoTracking().Where(r => r.Status == RecurringStatus.Active).ToDictionaryAsync(r => r.Id);
        var payday = occ.Where(o => o.Amount > 0 && recs.TryGetValue(o.RecurringId, out var r) && !r.IsTransfer && ids.Contains(r.AccountId))
            .OrderBy(o => o.Due).FirstOrDefault();
        var until = payday?.Due ?? today.AddDays(30);
        var outgoing = occ.Where(o => o.Due < until && o.Amount < 0 && recs.TryGetValue(o.RecurringId, out var r) && ids.Contains(r.AccountId) && !r.IsTransfer)
            .Sum(o => -o.AmountCzk * (accounts.First(a => a.Id == recs[o.RecurringId].AccountId) is var acc ? Weight(acc) : 1));
        _ = rates;
        return new PaydayForecast(payday?.Due, payday is null ? null : recs[payday.RecurringId].Name, Math.Round(disposable, 2), Math.Round(outgoing, 2),
            Math.Round(disposable - outgoing, 2));
    }
}

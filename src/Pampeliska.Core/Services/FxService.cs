using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Integrations;

namespace Pampeliska.Core.Services;

/// <summary>
/// Přepočet do Kč kurzem ČNB. Kurzy se berou z DB (plní je <see cref="FxRateSyncService"/>), chybějící den
/// se zkusí stáhnout; když ČNB nejde, použije se poslední známý kurz před datem.
/// </summary>
public class FxService(AppDbContext db, IServiceProvider services, ILogger<FxService> log)
{
    public static readonly string[] Currencies = ["CZK", "EUR", "USD"];

    private readonly Dictionary<(string, DateOnly), decimal> _cache = [];

    public async Task<decimal> RateAsync(string currency, DateOnly date, FxMode mode = FxMode.DayOfPayment)
    {
        currency = currency.ToUpperInvariant();
        if (currency == "CZK") return 1m;
        if (_cache.TryGetValue((currency, date), out var cached)) return cached;
        decimal rate;
        if (mode == FxMode.MonthlyAverage)
        {
            var from = new DateOnly(date.Year, date.Month, 1);
            var to = from.AddMonths(1).AddDays(-1);
            var month = await db.ExchangeRates.AsNoTracking()
                .Where(r => r.Currency == currency && r.Date >= from && r.Date <= to).Select(r => r.Rate).ToListAsync();
            rate = month.Count > 0 ? Math.Round(month.Average(), 4) : await DayRateAsync(currency, date);
        }
        else rate = await DayRateAsync(currency, date);
        _cache[(currency, date)] = rate;
        return rate;
    }

    private async Task<decimal> DayRateAsync(string currency, DateOnly date)
    {
        // ČNB vyhlašuje kurz jen v pracovní dny – bere se poslední vyhlášený do data včetně
        var near = await db.ExchangeRates.AsNoTracking()
            .Where(r => r.Currency == currency && r.Date <= date && r.Date >= date.AddDays(-6))
            .OrderByDescending(r => r.Date).FirstOrDefaultAsync();
        if (near is not null) return near.Rate;

        if (services.GetService(typeof(CnbRates)) is CnbRates cnb)
        {
            try
            {
                return (await cnb.GetAsync(currency, date)).Rate;
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or InvalidOperationException)
            {
                log.LogWarning("Kurz {Currency} k {Date} se nepodařilo stáhnout: {Error}", currency, date, e.Message);
            }
        }
        var last = await db.ExchangeRates.AsNoTracking()
            .Where(r => r.Currency == currency && r.Date <= date).OrderByDescending(r => r.Date).FirstOrDefaultAsync()
            ?? await db.ExchangeRates.AsNoTracking().Where(r => r.Currency == currency).OrderBy(r => r.Date).FirstOrDefaultAsync();
        return last?.Rate ?? throw new DomainException($"Chybí kurz ČNB pro {currency} k {date:d. M. yyyy}.");
    }

    public async Task<decimal> ToCzkAsync(decimal amount, string currency, DateOnly date, FxMode mode = FxMode.DayOfPayment) =>
        currency == "CZK" ? amount : Math.Round(amount * await RateAsync(currency, date, mode), 2);

    /// <summary>Poslední známé kurzy (pro přepočet zůstatků a čistého jmění „dnes“).</summary>
    public async Task<Dictionary<string, decimal>> LatestAsync(DateOnly asOf)
    {
        var result = new Dictionary<string, decimal> { ["CZK"] = 1m };
        foreach (var c in Currencies.Where(c => c != "CZK"))
        {
            try { result[c] = await RateAsync(c, asOf); }
            catch (DomainException) { }
        }
        return result;
    }

    public async Task<DateOnly?> LatestRateDateAsync() =>
        await db.ExchangeRates.AsNoTracking().OrderByDescending(r => r.Date).Select(r => (DateOnly?)r.Date).FirstOrDefaultAsync();
}

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pampeliska.Core.Data;
using Pampeliska.Core.Integrations;
using Pampeliska.Core.Services;

namespace Pampeliska.Core;

public static class CoreServices
{
    public static IServiceCollection AddPampeliskaCore(this IServiceCollection services)
    {
        services.AddScoped<FxService>();
        services.AddScoped<ShareService>();
        services.AddScoped<TransferMatcher>();
        services.AddScoped<ImportService>();
        services.AddScoped<BatchService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<AccountService>();
        services.AddScoped<AccountQueries>();
        services.AddScoped<BalanceService>();
        services.AddScoped<HouseholdService>();
        return services;
    }
}

/// <summary>Denně stáhne kurzy ČNB (EUR, USD) a doplní chybějící dny za poslední měsíc.</summary>
public class FxRateSyncService(IServiceScopeFactory scopes, TimeProvider time, ILogger<FxRateSyncService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromHours(3));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var cnb = scope.ServiceProvider.GetRequiredService<CnbRates>();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var today = time.Today();
                for (var d = today.AddDays(-31); d <= today; d = d.AddDays(1))
                {
                    if (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
                    if (db.ExchangeRates.Any(r => r.Date == d && r.Currency == "EUR")) continue;
                    await cnb.GetAsync("EUR", d, stoppingToken);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogWarning("Stažení kurzů ČNB selhalo: {Error}", e.Message);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

/// <summary>Denní kontroly: návrhy pravidelných plateb, výhled zůstatku, podmínky účtů → upozornění v aplikaci.</summary>
public class DailyChecksService(IServiceScopeFactory scopes, ILogger<DailyChecksService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                foreach (var check in scope.ServiceProvider.GetServices<IDailyCheck>())
                    await check.RunAsync(stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Denní kontroly selhaly");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

/// <summary>Úloha spouštěná <see cref="DailyChecksService"/>.</summary>
public interface IDailyCheck
{
    Task RunAsync(CancellationToken ct);
}

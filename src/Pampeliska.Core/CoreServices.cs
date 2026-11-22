using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
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
        services.AddScoped<RuleService>();
        services.AddScoped<NoteService>();
        services.AddScoped<TransactionService>();
        services.AddScoped<InboxService>();
        services.AddScoped<StatsService>();
        services.AddScoped<RecurringService>();
        services.AddScoped<ForecastService>();
        services.AddScoped<PredictionService>();
        services.AddScoped<ConditionService>();
        services.AddScoped<BudgetService>();
        services.AddScoped<SavingsService>();
        services.AddScoped<SavingTipService>();
        services.AddScoped<InvestmentService>();
        services.AddScoped<NotificationService>();
        services.AddScoped<IDailyCheck>(sp => sp.GetRequiredService<NotificationService>());
        services.AddScoped<ExportService>();
        services.AddOptions<InboundEmailOptions>();
        services.AddSingleton<InboundEmailQueue>();
        services.AddSingleton<MimeKit.Cryptography.IDnsResolver, DnsClientResolver>();
        services.AddSingleton<INotificationExtractor, ClaudeNotificationExtractor>();
        services.AddScoped<DkimChecker>();
        services.AddScoped<InboundEmailProcessor>();
        services.AddScoped<InboundEmailService>();
        services.AddScoped<IDailyCheck>(sp => sp.GetRequiredService<InboundEmailService>());
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

/// <summary>
/// Zpracovává přijaté e-maily z fronty (hned po příjmu) a jednou za 10 minut zkusí znovu ty, které zůstaly ve stavu Přijato
/// (dočasná chyba modelu, výpadek aplikace během zpracování).
/// </summary>
public class InboundEmailWorker(IServiceScopeFactory scopes, InboundEmailQueue queue, ILogger<InboundEmailWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _ = SweepAsync(stoppingToken);
        await foreach (var id in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<InboundEmailProcessor>().ProcessAsync(id, ct: stoppingToken);
            }
            catch (DomainException) { /* mezitím smazaný nebo už zpracovaný e-mail */ }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Zpracování e-mailu {Id} selhalo", id);
            }
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(15), ct);
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
            do
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    if (!scope.ServiceProvider.GetRequiredService<InboundEmailProcessor>().ExtractionAvailable) continue;
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var ids = await db.InboundEmails.Where(m => m.State == InboundEmailState.Received && m.Attempts < InboundEmailProcessor.MaxAttempts)
                        .OrderBy(m => m.Id).Select(m => m.Id).ToListAsync(ct);
                    ids.ForEach(queue.Enqueue);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    log.LogWarning("Kontrola nezpracovaných e-mailů selhala: {Error}", e.Message);
                }
            } while (await timer.WaitForNextTickAsync(ct));
        }
        catch (OperationCanceledException) { }
    }
}

/// <summary>Úloha spouštěná <see cref="DailyChecksService"/>.</summary>
public interface IDailyCheck
{
    Task RunAsync(CancellationToken ct);
}

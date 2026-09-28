namespace Pampeliska.Api.OAuth;

/// <summary>Každých 6 hodin uklidí prošlé OAuth kódy, tokeny a opuštěné registrace klientů.</summary>
public class OAuthCleanupService(IServiceScopeFactory scopes, ILogger<OAuthCleanupService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(1), ct);
            using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
            do
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var removed = await scope.ServiceProvider.GetRequiredService<OAuthService>().CleanupAsync();
                    if (removed > 0) log.LogInformation("OAuth úklid: odstraněno {Count} záznamů", removed);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    log.LogWarning(e, "OAuth úklid selhal");
                }
            } while (await timer.WaitForNextTickAsync(ct));
        }
        catch (OperationCanceledException)
        {
            // vypínání aplikace
        }
    }
}

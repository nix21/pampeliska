using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Api.Endpoints;

public record BackupReport(bool Success, long? SizeBytes, string? Message, DateTimeOffset? StartedAt);

public static class Endpoints
{
    public static void MapPampeliskaEndpoints(this RouteGroupBuilder api)
    {
        api.MapHouseholdEndpoints();
        api.MapAccountEndpoints();
        api.MapTransactionEndpoints();
        api.MapCategoryEndpoints();
        api.MapPlanningEndpoints();
    }

    /// <summary>Zálohovací kontejner hlásí výsledek (chráněno sdíleným tokenem Backup:Token).</summary>
    public static void MapBackupEndpoints(this WebApplication app)
    {
        app.MapPost("/internal/backup-report", async (HttpRequest req, BackupReport report, AppDbContext db, IConfiguration config) =>
        {
            var token = config["Backup:Token"];
            if (string.IsNullOrEmpty(token) || req.Headers.Authorization != $"Bearer {token}") return Results.Unauthorized();
            db.BackupRuns.Add(new BackupRun
            {
                StartedAt = (report.StartedAt ?? DateTimeOffset.UtcNow).ToUniversalTime(), FinishedAt = DateTimeOffset.UtcNow,
                Success = report.Success, SizeBytes = report.SizeBytes, Message = report.Message,
            });
            await db.SaveChangesAsync();
            return Results.Ok();
        }).AllowAnonymous();

        app.MapGet("/api/backups", async (AppDbContext db) =>
            await db.BackupRuns.AsNoTracking().OrderByDescending(b => b.StartedAt).Take(60).ToListAsync()).RequireAuthorization();
    }
}

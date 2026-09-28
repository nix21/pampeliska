using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record TestImportInput(int AccountId, List<ImportItem> Items, BatchSource Source = BatchSource.Mcp);
public record TestRatesInput(List<ExchangeRate> Rates);

/// <summary>Pomocné endpointy pro E2E testy a lokální vývoj (jen Development nebo Testing:Endpoints=true).</summary>
public static class TestingEndpoints
{
    public static void MapTestingEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/testing").RequireAuthorization();

        // Import jako přes MCP, ale z cookie session (Playwright nemá OAuth)
        g.MapPost("/import", async (TestImportInput input, ImportService svc, CurrentUser user) =>
            await svc.ImportAsync(input.AccountId, input.Items,
                new ImportOptions(input.Source, await user.ActorAsync(), (await user.MemberAsync())?.Id, ClientName: "E2E test")));

        g.MapPost("/rates", async (TestRatesInput input, AppDbContext db) =>
        {
            foreach (var r in input.Rates)
                if (!await db.ExchangeRates.AnyAsync(x => x.Date == r.Date && x.Currency == r.Currency))
                    db.ExchangeRates.Add(new ExchangeRate { Date = r.Date, Currency = r.Currency, Rate = r.Rate });
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapPost("/demo", async (DemoSeeder seeder, CurrentUser user) =>
        {
            await seeder.SeedAsync((await user.RequireMemberAsync()).Id);
            app.Services.GetRequiredService<MemberDirectory>().Invalidate();
            return Results.NoContent();
        });

        g.MapPost("/reset", async (HouseholdService svc, AppDbContext db) =>
        {
            var h = await db.Households.FirstAsync();
            await svc.DeleteAllDataAsync(h.Name);
            h.Name = "Domácnost";
            h.Settings = new HouseholdSettings();
            var owner = await db.Members.OrderBy(m => m.Id).FirstOrDefaultAsync(m => m.Role == MemberRole.Owner);
            db.Members.RemoveRange(await db.Members.Where(m => owner == null || m.Id != owner.Id).ToListAsync());
            await db.SaveChangesAsync();
            app.Services.GetRequiredService<MemberDirectory>().Invalidate();
            return Results.NoContent();
        });
    }
}

using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record CorrectionInput(DateOnly Date, decimal ActualBalance);
public record ArchiveInput(bool Archived = true);

public static class AccountEndpoints
{
    public static void MapAccountEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/accounts", (AccountQueries q, bool? archived) => q.ListAsync(archived == true));
        api.MapGet("/accounts/{id:int}", (int id, AccountQueries q) => q.GetAsync(id));
        api.MapPost("/accounts", async (AccountInput input, AccountService svc, AccountQueries q) =>
            await q.GetAsync((await svc.CreateAsync(input)).Id));
        api.MapPut("/accounts/{id:int}", async (int id, AccountInput input, AccountService svc, AccountQueries q) =>
        {
            await svc.UpdateAsync(id, input);
            return await q.GetAsync(id);
        });
        api.MapPost("/accounts/{id:int}/archive", async (int id, ArchiveInput input, AccountService svc) =>
        {
            await svc.ArchiveAsync(id, input.Archived);
            return Results.NoContent();
        });
        api.MapPost("/accounts/{id:int}/corrections", async (int id, CorrectionInput input, AccountService svc, CurrentUser user) =>
        {
            var t = await svc.AddCorrectionAsync(id, input.Date, input.ActualBalance, await user.ActorAsync());
            return new { t.Id, t.Amount, t.Date };
        });
    }
}

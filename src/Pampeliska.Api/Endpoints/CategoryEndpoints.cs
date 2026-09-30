using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record MergeInput(int TargetId);
public record SuggestionInput(string Pattern, int CategoryId);
public record RuleTestInput(RuleInput Draft, int? RuleId);
public record MoveInput(int Position);

public static class CategoryEndpoints
{
    public static void MapCategoryEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/categories", (CategoryService svc) => svc.TreeAsync());
        api.MapGet("/categories/stats", (StatsService svc, string period, int? member, bool? confirmedOnly, bool? compare, CategoryKind? kind) =>
            svc.ExpensesAsync(new StatsFilter(Core.DateRange.Parse(period), member, confirmedOnly == true), compare != false, kind ?? CategoryKind.Expense));
        api.MapPost("/categories", async (CategoryInput i, CategoryService svc) => { var c = await svc.CreateAsync(i); return new { c.Id }; });
        api.MapPut("/categories/{id:int}", async (int id, CategoryInput i, CategoryService svc) => { await svc.UpdateAsync(id, i); return Results.NoContent(); });
        api.MapDelete("/categories/{id:int}", async (int id, CategoryService svc) => { await svc.DeleteAsync(id); return Results.NoContent(); });
        api.MapGet("/categories/{id:int}/merge-preview", (int id, int target, CategoryService svc) => svc.MergePreviewAsync(id, target));
        api.MapPost("/categories/{id:int}/merge", (int id, MergeInput i, CategoryService svc) => svc.MergeAsync(id, i.TargetId));

        api.MapGet("/notes", (NoteService svc, string? search, int? categoryId) => svc.ListAsync(search, categoryId));
        api.MapPost("/notes", async (NoteInput i, NoteService svc, CurrentUser user) => await svc.CreateAsync(i, await user.ActorAsync()));
        api.MapPut("/notes/{id:int}", async (int id, NoteInput i, NoteService svc, CurrentUser user) => await svc.UpdateAsync(id, i, await user.ActorAsync()));
        api.MapDelete("/notes/{id:int}", async (int id, NoteService svc) => { await svc.DeleteAsync(id); return Results.NoContent(); });

        api.MapGet("/rules", (RuleService svc) => svc.ListAsync());
        api.MapPost("/rules", async (RuleInput i, RuleService svc) => { var r = await svc.CreateAsync(i); return new { r.Id }; });
        api.MapPut("/rules/{id:int}", async (int id, RuleInput i, RuleService svc) => { await svc.UpdateAsync(id, i); return Results.NoContent(); });
        api.MapPost("/rules/{id:int}/move", async (int id, MoveInput i, RuleService svc) => { await svc.MoveAsync(id, i.Position); return Results.NoContent(); });
        api.MapDelete("/rules/{id:int}", async (int id, RuleService svc) => { await svc.DeleteAsync(id); return Results.NoContent(); });
        api.MapPost("/rules/test", (RuleTestInput i, RuleService svc) => svc.TestAsync(i.Draft, i.RuleId));
        api.MapPost("/rules/{id:int}/apply", async (int id, RuleService svc) => new { changed = await svc.ApplyToHistoryAsync(id) });
        api.MapGet("/rules/suggestions", (RuleService svc) => svc.SuggestionsAsync());
        api.MapPost("/rules/suggestions/accept", async (SuggestionInput i, RuleService svc) =>
        {
            var r = await svc.AcceptSuggestionAsync(i.Pattern, i.CategoryId);
            return new { r.Id };
        });
        api.MapPost("/rules/suggestions/dismiss", async (SuggestionInput i, RuleService svc) =>
        {
            await svc.DismissSuggestionAsync(i.Pattern, i.CategoryId);
            return Results.NoContent();
        });
    }
}

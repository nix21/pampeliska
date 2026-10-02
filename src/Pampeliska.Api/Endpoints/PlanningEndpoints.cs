using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record EndInput(bool Delete = false);
public record SkipInput(DateOnly Due);
public record PairInput(int TransactionId);
public record AmountAlertInput(bool Accept);
public record CancelMarksInput(Dictionary<int, bool> Marks);
public record TipStatusInput(SavingTipStatus Status);
public record ValueInput(DateOnly Date, decimal Value, decimal? Deposits = null);

public static class PlanningEndpoints
{
    private static DateOnly Month(string? month, TimeProvider time) =>
        string.IsNullOrWhiteSpace(month) ? time.Today() : DateRange.Parse(month).From;

    public static void MapPlanningEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/stats/overview", (StatsService svc, string period, int? member, bool? confirmedOnly, bool? compare) =>
            svc.OverviewAsync(new StatsFilter(DateRange.Parse(period), member, confirmedOnly == true), compare != false));
        api.MapGet("/stats/expenses", (StatsService svc, string period, int? member, bool? confirmedOnly, bool? compare, CategoryKind? kind) =>
            svc.ExpensesAsync(new StatsFilter(DateRange.Parse(period), member, confirmedOnly == true), compare != false, kind ?? CategoryKind.Expense));
        api.MapGet("/stats/members", (StatsService svc, string period, bool? confirmedOnly) => svc.MembersAsync(DateRange.Parse(period), confirmedOnly == true));
        api.MapGet("/stats/net-worth", (InvestmentService svc, int? months, int? member) => svc.NetWorthAsync(months ?? 12, member));

        api.MapGet("/recurring", (RecurringService svc, bool? ended) => svc.ListAsync(ended == true));
        api.MapGet("/recurring/occurrences", (RecurringService svc, DateOnly from, DateOnly to, int? account) => svc.OccurrencesAsync(from, to, account));
        api.MapGet("/recurring/alerts", (RecurringService svc) => svc.AlertsAsync());
        api.MapPost("/recurring", async (RecurringInput i, RecurringService svc) =>
        {
            var r = await svc.CreateAsync(i, RecurringSource.Manual);
            return new { r.Id };
        });
        api.MapPut("/recurring/{id:int}", async (int id, RecurringInput i, RecurringService svc) => { await svc.UpdateAsync(id, i); return Results.NoContent(); });
        api.MapPost("/recurring/{id:int}/confirm", async (int id, RecurringService svc) => { await svc.ConfirmSuggestionAsync(id); return Results.NoContent(); });
        api.MapPost("/recurring/{id:int}/end", async (int id, EndInput i, RecurringService svc) => { await svc.EndAsync(id, i.Delete); return Results.NoContent(); });
        api.MapPost("/recurring/{id:int}/skip", async (int id, SkipInput i, RecurringService svc) => { await svc.SkipAsync(id, i.Due); return Results.NoContent(); });
        api.MapPost("/recurring/{id:int}/pair", async (int id, PairInput i, RecurringService svc) => { await svc.PairAsync(id, i.TransactionId); return Results.NoContent(); });
        api.MapPost("/recurring/{id:int}/amount-alert", async (int id, AmountAlertInput i, RecurringService svc) =>
        {
            await svc.ResolveAmountAlertAsync(id, i.Accept);
            return Results.NoContent();
        });
        api.MapPost("/recurring/detect", async (RecurringService svc) => new { suggested = await svc.DetectAsync() });

        api.MapGet("/forecast", (ForecastService svc, int? horizon, int? account) => svc.ForecastAsync(horizon ?? 30, account));
        api.MapGet("/forecast/payday", (ForecastService svc, int? member) => svc.UntilPaydayAsync(member));
        api.MapGet("/conditions", (ConditionService svc, int? account, string? month, int? member, TimeProvider time) =>
            svc.EvaluateAsync(account, Month(month, time), member));

        api.MapGet("/budgets", (BudgetService svc, string? month, int? member, bool? confirmedOnly, TimeProvider time) =>
            svc.OverviewAsync(Month(month, time), member, confirmedOnly == true));
        api.MapGet("/budgets/{categoryId:int}/series", (int categoryId, BudgetService svc, string? month, int? member, bool? confirmedOnly, bool? yearly, TimeProvider time) =>
            svc.SeriesAsync(categoryId, Month(month, time), member, confirmedOnly == true, yearly == true));
        api.MapPut("/budgets", async (BudgetInput i, BudgetService svc) => { await svc.SetAsync(i); return Results.NoContent(); });

        api.MapGet("/savings", (SavingsService svc, string? month, int? member, bool? confirmedOnly, TimeProvider time) =>
            svc.OverviewAsync(Month(month, time), member, confirmedOnly == true));
        api.MapPost("/savings/cancel-marks", async (CancelMarksInput i, SavingsService svc) => { await svc.MarkToCancelAsync(i.Marks); return Results.NoContent(); });
        api.MapGet("/savings/tips", (SavingTipService svc) => svc.ListAsync());
        api.MapPost("/savings/tips/{id:int}/status", (int id, TipStatusInput i, SavingTipService svc) => svc.SetStatusAsync(id, i.Status));

        api.MapGet("/investments", (InvestmentService svc) => svc.AccountsAsync());
        api.MapPost("/investments/{accountId:int}/values", async (int accountId, ValueInput i, InvestmentService svc) =>
        {
            await svc.AddValueAsync(accountId, i.Date, i.Value, i.Deposits);
            return Results.NoContent();
        });
        api.MapPost("/investments/trades", async (TradeInput i, InvestmentService svc) => { var t = await svc.AddTradeAsync(i); return new { t.Id }; });
        api.MapDelete("/investments/trades/{id:int}", async (int id, InvestmentService svc) => { await svc.DeleteTradeAsync(id); return Results.NoContent(); });

        api.MapGet("/badges", (NotificationService svc) => svc.BadgesAsync());
        api.MapGet("/notifications", (NotificationService svc) => svc.ListAsync());
        api.MapPost("/notifications/{id:int}/dismiss", async (int id, NotificationService svc) => { await svc.DismissAsync(id); return Results.NoContent(); });
        api.MapPost("/notifications/refresh", async (NotificationService svc, CancellationToken ct) => { await svc.RunAsync(ct); return Results.NoContent(); });
    }
}

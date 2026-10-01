using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record IdsInput(List<int> Ids);
public record BulkInput(List<int> Ids, int? CategoryId, NeedType? Need, bool Confirm);
public record DuplicateInput(bool Keep);
public record LinkInput(int A, int B);
public record ManualTxInput(int AccountId, DateOnly Date, decimal Amount, string Counterparty, string? Message, int? CategoryId, PaymentType? PaymentType,
    string? Note, bool Confirm = true);
public record ConfidentInput(int MinConfidence = 90);

public static class TransactionEndpoints
{
    public static DateRange? Range(string? period) => string.IsNullOrWhiteSpace(period) ? null : DateRange.Parse(period);

    public static void MapTransactionEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/transactions", async (TransactionService svc, string? period, int? account, int? member, KindFilter? kind, int? category, string? search,
                bool? split, bool? unconfirmed, bool? recurring, bool? excluded, bool? corrections, bool? uncategorized, bool? suspected, bool? confirmedOnly,
                int? batch, TxSort? sort, int? skip, int? take, string? from, int? tip, SavingTipService tips) =>
        {
            // Platby k radě „Kde ušetřit“: pohyby rady bez ohledu na období
            var ids = tip is { } t ? await tips.TransactionIdsAsync(t) : null;
            return await svc.ListAsync(new TxFilter(ids is null ? Range(period) : null, account, member, kind ?? KindFilter.All, category, search,
                split == true, unconfirmed == true, recurring == true, excluded == true, corrections == true, uncategorized == true, suspected == true,
                confirmedOnly == true, batch, sort ?? TxSort.DateDesc, skip ?? 0, take ?? 200, from, ids));
        });

        api.MapGet("/transactions/summary", (StatsService svc, string period, int? account, int? member, bool? confirmedOnly) =>
            svc.SummaryAsync(DateRange.Parse(period), account, member, confirmedOnly == true));
        api.MapGet("/transfers/flows", (StatsService svc, string period, int? account) => svc.TransferFlowsAsync(DateRange.Parse(period), account));

        api.MapGet("/transactions/{id:int}", (int id, TransactionService svc) => svc.GetAsync(id));
        api.MapPatch("/transactions/{id:int}", async (int id, TxUpdate u, TransactionService svc, CurrentUser user) =>
            await svc.UpdateAsync(id, u, await user.ActorAsync()));
        api.MapDelete("/transactions/{id:int}", async (int id, TransactionService svc) =>
        {
            await svc.DeleteAsync(id);
            return Results.NoContent();
        });

        api.MapPost("/transactions", async (ManualTxInput i, ImportService import, TransactionService svc, CurrentUser user) =>
        {
            if (string.IsNullOrWhiteSpace(i.Counterparty)) throw new DomainException("Zadej protistranu nebo popis platby.");
            if (i.Amount == 0) throw new DomainException("Částka nesmí být nulová.");
            var actor = await user.ActorAsync();
            var res = await import.ImportAsync(i.AccountId, [new ImportItem(i.Date, i.Amount, i.Counterparty, Message: i.Message, PaymentType: i.PaymentType, Note: i.Note)],
                new ImportOptions(BatchSource.Manual, actor, (await user.MemberAsync())?.Id, Note: "Ruční zadání"));
            if (res.Created == 0) throw new DomainException("Stejný pohyb už v evidenci je.");
            var id = res.TransactionIds[0];
            if (i.CategoryId is not null || i.Confirm)
                await svc.UpdateAsync(id, new TxUpdate(CategoryId: i.CategoryId, SetCategory: i.CategoryId is not null,
                    Confirm: i.Confirm && i.CategoryId is not null ? true : null), actor);
            return await svc.GetAsync(id);
        });

        api.MapPost("/transactions/confirm", async (IdsInput i, TransactionService svc, CurrentUser user) =>
            new { confirmed = await svc.ConfirmAsync(i.Ids, await user.ActorAsync()) });
        api.MapPost("/transactions/bulk", async (BulkInput i, TransactionService svc, CurrentUser user) =>
            new { updated = await svc.BulkAsync(i.Ids, i.CategoryId, i.Need, i.Confirm, await user.ActorAsync()) });
        api.MapPost("/transactions/{id:int}/duplicate", async (int id, DuplicateInput i, TransactionService svc, CurrentUser user) =>
        {
            await svc.ResolveDuplicateAsync(id, i.Keep, await user.ActorAsync());
            return Results.NoContent();
        });
        api.MapPost("/transactions/{id:int}/unpair", async (int id, TransferMatcher m) =>
        {
            await m.UnpairAsync(id);
            return Results.NoContent();
        });
        api.MapPost("/transactions/link", async (LinkInput i, TransferMatcher m) =>
        {
            await m.LinkAsync(i.A, i.B);
            return Results.NoContent();
        });
        api.MapGet("/transactions/{id:int}/transfer-candidates", async (int id, TransactionService svc, TransferMatcher m) =>
        {
            var d = await svc.GetAsync(id);
            var t = new Transaction { Id = id, AccountId = d.Tx.AccountId, Date = d.Tx.Date, Amount = d.Tx.Amount, Currency = d.Tx.Currency, AmountCzk = d.Tx.AmountCzk };
            return (await m.CandidatesAsync(t)).Take(5).Select(c => TransactionService.ToRow(c));
        });

        api.MapGet("/inbox", (InboxService svc, InboxFilter? filter, int? member, string? search) => svc.ListAsync(filter ?? InboxFilter.All, member, search));
        api.MapPost("/inbox/confirm-confident", async (ConfidentInput i, InboxService svc, CurrentUser user) =>
            new { confirmed = await svc.ConfirmConfidentAsync(i.MinConfidence, await user.ActorAsync()) });

        api.MapGet("/batches", (BatchService svc) => svc.ListAsync());
        api.MapGet("/batches/{id:int}", (int id, BatchService svc) => svc.GetAsync(id));
        api.MapPost("/batches/{id:int}/categorize", async (int id, BatchService svc) => new { categorized = await svc.RunRulesAsync(id) });
        api.MapPost("/batches/{id:int}/confirm", async (int id, BatchService svc, CurrentUser user) =>
            new { confirmed = await svc.ConfirmAllAsync(id, await user.ActorAsync()) });

        api.MapGet("/export/transactions.csv", async (ExportService svc, string period) =>
            Results.File(await svc.TransactionsCsvAsync(DateRange.Parse(period)), "text/csv; charset=utf-8", $"pampeliska-pohyby-{period.Replace("..", "_")}.csv"));
    }
}

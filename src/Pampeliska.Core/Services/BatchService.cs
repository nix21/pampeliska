using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record BatchSummary(int Id, DateTimeOffset CreatedAt, BatchSource Source, string? ClientName, string? CreatedBy,
    BatchState State, DateTimeOffset? CategorizedAt, DateTimeOffset? ConfirmedAt, int Count, int Confirmed, int Pending,
    int DuplicateCount, int SuspectedCount, IReadOnlyList<string> Accounts, string? Note);

public record BatchItem(int Id, DateOnly Date, string Counterparty, decimal Amount, string Currency, decimal AmountCzk,
    string Account, TransactionKind Kind, TransactionStatus Status, string? Category, CategorySource? Source, int? AiConfidence,
    bool SuspectedDuplicate);

public record SkippedItem(DateOnly Date, string Counterparty, decimal Amount, int? ExistingTransactionId);

public record BatchDetail(BatchSummary Batch, IReadOnlyList<BatchItem> Items, IReadOnlyList<SkippedItem> Skipped);

/// <summary>Dávky importu: nahráno → kategorizováno → potvrzeno.</summary>
public class BatchService(AppDbContext db, TimeProvider time)
{
    /// <summary>Stav dávky podle jejích pohybů.</summary>
    public static async Task RecomputeStateAsync(AppDbContext db, ImportBatch batch, DateTimeOffset now)
    {
        var txs = await db.Transactions.Where(t => t.BatchId == batch.Id)
            .Select(t => new { t.Status, t.CategoryId, HasSplits = t.Splits.Any(), t.Kind }).ToListAsync();
        var needsCategory = txs.Where(t => t.Kind is not (TransactionKind.Transfer or TransactionKind.InvestmentTransfer or TransactionKind.Correction));
        var state = txs.Count > 0 && txs.All(t => t.Status == TransactionStatus.Confirmed) ? BatchState.Confirmed
            : needsCategory.All(t => t.CategoryId != null || t.HasSplits) ? BatchState.Categorized
            : BatchState.Uploaded;
        if (state >= BatchState.Categorized) batch.CategorizedAt ??= now;
        if (state == BatchState.Confirmed) batch.ConfirmedAt ??= now;
        batch.State = state;
    }

    public async Task RecomputeAsync(IEnumerable<int?> batchIds)
    {
        var ids = batchIds.OfType<int>().Distinct().ToList();
        if (ids.Count == 0) return;
        var batches = await db.ImportBatches.Where(b => ids.Contains(b.Id)).ToListAsync();
        foreach (var b in batches) await RecomputeStateAsync(db, b, time.GetUtcNow());
        await db.SaveChangesAsync();
    }

    public async Task<List<BatchSummary>> ListAsync(int take = 50)
    {
        var batches = await db.ImportBatches.AsNoTracking().OrderByDescending(b => b.CreatedAt).Take(take).ToListAsync();
        return await SummariesAsync(batches);
    }

    private async Task<List<BatchSummary>> SummariesAsync(List<ImportBatch> batches)
    {
        var ids = batches.Select(b => b.Id).ToList();
        var stats = await db.Transactions.AsNoTracking().Where(t => t.BatchId != null && ids.Contains(t.BatchId.Value))
            .GroupBy(t => new { t.BatchId, t.AccountId })
            .Select(g => new { g.Key.BatchId, g.Key.AccountId, Count = g.Count(), Confirmed = g.Count(t => t.Status == TransactionStatus.Confirmed),
                Suspected = g.Count(t => t.SuspectedDuplicateOfId != null) })
            .ToListAsync();
        var accounts = await db.Accounts.AsNoTracking().Include(a => a.Institution).ToDictionaryAsync(a => a.Id);
        var members = await db.Members.AsNoTracking().ToDictionaryAsync(m => m.Id, m => m.Name);
        return batches.Select(b =>
        {
            var s = stats.Where(x => x.BatchId == b.Id).ToList();
            var confirmed = s.Sum(x => x.Confirmed);
            var count = s.Sum(x => x.Count);
            return new BatchSummary(b.Id, b.CreatedAt, b.Source, b.ClientName,
                b.CreatedByMemberId is { } m ? members.GetValueOrDefault(m) : null, b.State, b.CategorizedAt, b.ConfirmedAt,
                count, confirmed, count - confirmed, b.DuplicateCount, s.Sum(x => x.Suspected),
                s.Select(x => accounts.TryGetValue(x.AccountId, out var a) ? $"{a.Institution?.Abbrev ?? ""} {a.Name}".Trim() : "?").ToList(), b.Note);
        }).ToList();
    }

    public async Task<BatchDetail> GetAsync(int id)
    {
        var batch = await db.ImportBatches.AsNoTracking().Include(b => b.SkippedDuplicates).FirstOrDefaultAsync(b => b.Id == id)
            ?? throw new DomainException($"Dávka {id} neexistuje.");
        var summary = (await SummariesAsync([batch]))[0];
        var cats = await CategoryService.PathsAsync(db);
        var items = await db.Transactions.AsNoTracking().Include(t => t.Account).Include(t => t.Splits)
            .Where(t => t.BatchId == id).OrderByDescending(t => t.Date).ThenBy(t => t.Id).ToListAsync();
        return new BatchDetail(summary,
            items.Select(t => new BatchItem(t.Id, t.Date, t.Counterparty, t.Amount, t.Currency, t.AmountCzk, t.Account!.Name, t.Kind, t.Status,
                t.IsSplit ? $"Rozděleno · {t.Splits.Count} části" : t.CategoryId is { } c ? cats.GetValueOrDefault(c) : null,
                t.CategorySource, t.AiConfidence, t.SuspectedDuplicateOfId != null)).ToList(),
            batch.SkippedDuplicates.Select(s => new SkippedItem(s.Date, s.Counterparty, s.Amount, s.ExistingTransactionId)).ToList());
    }

    /// <summary>„Spustit kategorizaci“: znovu použije pravidla na nezařazené pohyby dávky.</summary>
    public async Task<int> RunRulesAsync(int id)
    {
        var rules = await db.Rules.AsNoTracking().Include(r => r.Conditions).Where(r => r.Enabled).OrderBy(r => r.Priority).ToListAsync();
        var txs = await db.Transactions.Include(t => t.Splits).Include(t => t.Shares)
            .Where(t => t.BatchId == id && t.Status == TransactionStatus.Suggested && t.CategoryId == null).ToListAsync();
        var n = 0;
        foreach (var t in txs.Where(RuleEngine.CanApplyTo))
            if (RuleEngine.FirstMatch(rules, t) is { } rule)
            {
                RuleEngine.Apply(rule, t);
                n++;
            }
        await db.SaveChangesAsync();
        await RecomputeAsync([id]);
        return n;
    }

    /// <summary>Potvrdí všechny zařazené pohyby dávky (nezařazené a podezřelé duplicity zůstanou ve frontě).</summary>
    public async Task<int> ConfirmAllAsync(int id, string actor)
    {
        var now = time.GetUtcNow();
        var txs = await db.Transactions.Include(t => t.Splits)
            .Where(t => t.BatchId == id && t.Status == TransactionStatus.Suggested && t.SuspectedDuplicateOfId == null).ToListAsync();
        var n = 0;
        foreach (var t in txs.Where(t => t.IsCategorized || t.Kind is TransactionKind.Transfer or TransactionKind.InvestmentTransfer))
        {
            t.Status = TransactionStatus.Confirmed;
            t.ConfirmedAt = now;
            t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = "Potvrzeno s celou dávkou" });
            n++;
        }
        await db.SaveChangesAsync();
        await RecomputeAsync([id]);
        return n;
    }
}

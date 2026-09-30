using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum InboxFilter { All, AiUnsure, NoSuggestion, SplitSuggestion, Duplicates }

public record InboxItem(TxRow Tx, string? RawText, string? AiReason, IReadOnlyList<AiAlternative> Alternatives, string? Rule, TxRef? DuplicateOf,
    string? BatchSource, DateTimeOffset? ImportedAt);

public record InboxCounts(int All, int AiUnsure, int NoSuggestion, int SplitSuggestion, int Duplicates);

public record InboxResult(IReadOnlyList<InboxItem> Items, InboxCounts Counts);

public record SimilarTx(DateOnly Date, string Counterparty, decimal Amount, string Currency, int? CategoryId, string? CategoryPath, CategorySource? Source);

public record QueueItem(int Id, DateOnly Date, TimeOnly? Time, int AccountId, string Account, decimal Amount, string Currency, decimal AmountCzk,
    string Counterparty, string? Message, string? RawText, string? CounterpartyAccount, string? Mcc, PaymentType PaymentType,
    TransactionStatus Status, int? SuggestedCategoryId, string? SuggestedCategoryPath, CategorySource? Source, int? AiConfidence,
    bool SuspectedDuplicate, IReadOnlyList<SimilarTx> Similar, IReadOnlyList<QueueNote> Notes, string? TransferBetweenMembers);

/// <summary>Fronta „Ke kategorizaci“: nepotvrzené a nezařazené pohyby a podezřelé duplicity.</summary>
public class InboxService(AppDbContext db, TransactionService txs)
{
    public const int UnsureBelow = 70;

    private IQueryable<Transaction> Base(int? memberId) =>
        db.Transactions.AsNoTracking()
            .Where(t => (t.Status == TransactionStatus.Suggested && (t.BetweenMembers || t.Kind != TransactionKind.Transfer
                         && t.Kind != TransactionKind.InvestmentTransfer && t.Kind != TransactionKind.Correction)) || t.SuspectedDuplicateOfId != null)
            .Where(t => memberId == null || t.Shares.Any(s => s.MemberId == memberId && s.Percent > 0));

    public async Task<InboxResult> ListAsync(InboxFilter filter, int? memberId, string? search)
    {
        var all = await Base(memberId).Include(t => t.Splits).Include(t => t.Shares).Include(t => t.Batch)
            .OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).ToListAsync();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = Text.Normalize(search);
            all = all.Where(t => RuleEngine.MerchantText(t).Contains(s) || Math.Abs(t.Amount).ToString("0.##").Contains(s.Replace(" ", ""))).ToList();
        }
        bool Unsure(Transaction t) => t.CategorySource == CategorySource.Ai && t.AiConfidence < UnsureBelow;
        bool NoSuggestion(Transaction t) => !t.IsCategorized;
        bool Split(Transaction t) => t.IsSplit;
        bool Dup(Transaction t) => t.SuspectedDuplicateOfId != null;
        var counts = new InboxCounts(all.Count, all.Count(Unsure), all.Count(NoSuggestion), all.Count(Split), all.Count(Dup));
        var filtered = filter switch
        {
            InboxFilter.AiUnsure => all.Where(Unsure),
            InboxFilter.NoSuggestion => all.Where(NoSuggestion),
            InboxFilter.SplitSuggestion => all.Where(Split),
            InboxFilter.Duplicates => all.Where(Dup),
            _ => all,
        };
        var ruleIds = all.Where(t => t.AppliedRuleId != null).Select(t => t.AppliedRuleId!.Value).Distinct().ToList();
        var rules = (await db.Rules.AsNoTracking().Include(r => r.Conditions).Where(r => ruleIds.Contains(r.Id)).ToListAsync())
            .ToDictionary(r => r.Id, r => RuleEngine.Describe(r));
        var dupIds = all.Where(Dup).Select(t => t.SuspectedDuplicateOfId!.Value).ToList();
        var dups = (await db.Transactions.AsNoTracking().Include(t => t.Batch).Where(t => dupIds.Contains(t.Id)).ToListAsync())
            .ToDictionary(t => t.Id, x => new TxRef(x.Id, x.Date, x.AccountId, x.Counterparty, x.Amount, x.Currency, x.AmountCzk, x.RawText, x.BatchId, x.Batch?.Source.ToString()));
        var items = filtered.Select(t => new InboxItem(TransactionService.ToRow(t), t.RawText, t.AiReason, TransactionService.ParseAlternatives(t.AiAlternatives),
            t.AppliedRuleId is { } r ? rules.GetValueOrDefault(r) : null, t.SuspectedDuplicateOfId is { } d ? dups.GetValueOrDefault(d) : null,
            t.Batch?.Source.ToString(), t.Batch?.CreatedAt ?? t.CreatedAt)).ToList();
        return new InboxResult(items, counts);
    }

    public Task<int> CountAsync() => Base(null).CountAsync();

    /// <summary>Potvrdí všechny návrhy s jistotou nad prahem (pravidla = 100 %). Podezřelé duplicity přeskočí.</summary>
    public async Task<int> ConfirmConfidentAsync(int minConfidence, string actor)
    {
        var ids = await Base(null)
            .Where(t => t.SuspectedDuplicateOfId == null && (t.CategoryId != null || t.Splits.Any())
                        && (t.CategorySource == CategorySource.Rule || t.CategorySource == CategorySource.Manual || t.AiConfidence >= minConfidence))
            .Select(t => t.Id).ToListAsync();
        return await txs.ConfirmAsync(ids, actor);
    }

    /// <summary>Fronta pro MCP klienta: i s podobnými dřív zařazenými platbami (kontext pro AI).</summary>
    public async Task<List<QueueItem>> QueueForAiAsync(int limit, bool onlyUncategorized, int? batchId)
    {
        var q = Base(null).Where(t => t.SuspectedDuplicateOfId == null);
        if (onlyUncategorized) q = q.Where(t => t.CategoryId == null && !t.Splits.Any());
        if (batchId is { } b) q = q.Where(t => t.BatchId == b);
        var items = await q.Include(t => t.Account).Include(t => t.Splits).OrderBy(t => t.Date).ThenBy(t => t.Id).Take(Math.Clamp(limit, 1, 200)).ToListAsync();
        var paths = await CategoryService.PathsAsync(db);
        var keys = items.Select(t => Text.MerchantKey(t.Counterparty)).Where(k => k.Length >= 3).Distinct().ToList();
        var history = await db.Transactions.AsNoTracking()
            .Where(t => t.CategoryId != null && (t.Status == TransactionStatus.Confirmed || t.CategorySource == CategorySource.Manual))
            .OrderByDescending(t => t.Date).Take(5000)
            .Select(t => new { t.Date, t.Counterparty, t.Amount, t.Currency, t.CategoryId, t.CategorySource }).ToListAsync();
        var notes = await db.CategorizationNotes.AsNoTracking().Where(n => n.MerchantPattern != null || n.CategoryId != null).ToListAsync();
        var parents = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.ParentId);
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id, a => a.Name);
        string? Between(Transaction t) => t.BetweenMembers && t.TransferAccountId is { } other
            ? (t.Amount < 0 ? $"{t.Account!.Name} → {accounts.GetValueOrDefault(other)}" : $"{accounts.GetValueOrDefault(other)} → {t.Account!.Name}")
            : null;
        var byKey = history.GroupBy(h => Text.MerchantKey(h.Counterparty)).Where(g => keys.Contains(g.Key)).ToDictionary(g => g.Key, g => g.Take(3).ToList());
        return items.Select(t =>
        {
            var similar = byKey.GetValueOrDefault(Text.MerchantKey(t.Counterparty)) ?? [];
            return new QueueItem(t.Id, t.Date, t.Time, t.AccountId, t.Account!.Name, t.Amount, t.Currency, t.AmountCzk, t.Counterparty, t.Message, t.RawText,
                t.CounterpartyAccount, t.Mcc, t.PaymentType, t.Status, t.CategoryId, t.CategoryId is { } c ? paths.GetValueOrDefault(c) : null, t.CategorySource,
                t.AiConfidence, t.SuspectedDuplicateOfId != null,
                similar.Select(s => new SimilarTx(s.Date, s.Counterparty, s.Amount, s.Currency, s.CategoryId, s.CategoryId is { } sc ? paths.GetValueOrDefault(sc) : null, s.CategorySource)).ToList(),
                NoteService.For(t, notes, parents), Between(t));
        }).ToList();
    }
}

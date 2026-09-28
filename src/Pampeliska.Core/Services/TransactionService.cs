using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum KindFilter { All, Expense, Income, Transfer }
public enum TxSort { DateDesc, AmountDesc, DateAsc }

public record TxFilter(
    DateRange? Range = null,
    int? AccountId = null,
    int? MemberId = null,
    KindFilter Kind = KindFilter.All,
    int? CategoryId = null,
    string? Search = null,
    bool Split = false,
    bool Unconfirmed = false,
    bool Recurring = false,
    bool Excluded = false,
    bool Corrections = false,
    bool Uncategorized = false,
    bool Suspected = false,
    bool ConfirmedOnly = false,
    int? BatchId = null,
    TxSort Sort = TxSort.DateDesc,
    int Skip = 0,
    int Take = 200);

public record SplitDto(int CategoryId, decimal Amount, decimal AmountCzk, NeedType? NeedOverride);
public record AiAlternative(int CategoryId, int Confidence);

public record TxRow(
    int Id, DateOnly Date, TimeOnly? Time, int AccountId, decimal Amount, string Currency, decimal AmountCzk, decimal FxRate,
    string Counterparty, string? Message, TransactionKind Kind, TransactionStatus Status, int? CategoryId, NeedType? NeedOverride,
    IReadOnlyList<SplitDto> Splits, IReadOnlyList<ShareDto> Shares, bool SharesOverridden, bool IsRecurring, bool ExcludeFromStats,
    CategorySource? CategorySource, int? AiConfidence, int? TransferPairId, int? TransferPairAccountId, int? RefundOfId,
    int? SuspectedDuplicateOfId, int? BatchId, PaymentType PaymentType, int? RecurringPaymentId, string? Note);

public record TxEventDto(DateTimeOffset At, string Actor, string Text);

public record TxRef(int Id, DateOnly Date, int AccountId, string Counterparty, decimal Amount, string Currency, decimal AmountCzk, string? RawText, int? BatchId, string? BatchSource);

public record TxDetail(TxRow Tx, string? RawText, string? CounterpartyAccount, string? Mcc, string? AiReason, IReadOnlyList<AiAlternative> AiAlternatives,
    string? AppliedRule, IReadOnlyList<TxEventDto> Events, TxRef? TransferPair, TxRef? RefundOf, TxRef? SuspectedDuplicateOf,
    decimal? CnbRate, int? CardHolderMemberId, string? BatchLabel, bool CanDelete);

public record TxPage(IReadOnlyList<TxRow> Items, int Total);

public record SplitInput(int CategoryId, decimal Amount, NeedType? NeedOverride = null);

/// <summary>Změna pohybu z webu nebo MCP. Null = beze změny (u kategorie rozhoduje SetCategory).</summary>
public record TxUpdate(
    int? CategoryId = null,
    bool SetCategory = false,
    List<SplitInput>? Splits = null,
    NeedType? NeedOverride = null,
    bool SetNeed = false,
    int? MemberId = null,
    bool SetMember = false,
    List<ShareDto>? Shares = null,
    bool? ExcludeFromStats = null,
    bool? IsRecurring = null,
    bool? Confirm = null,
    string? Note = null,
    int? RefundOfId = null,
    bool SetRefundOf = false,
    bool CreateRule = false,
    bool ApplyRuleToHistory = true);

public record AiSuggestion(int TransactionId, int? CategoryId, List<SplitInput>? Splits, int Confidence, string? Reason, List<AiAlternative>? Alternatives);

public record SuggestResult(int Applied, int AutoConfirmed, IReadOnlyList<string> Skipped);

/// <summary>Pohyby: výpis s filtry, detail, zařazení, rozdělení, podíly, potvrzení, návrhy AI.</summary>
public class TransactionService(AppDbContext db, BatchService batches, RuleService rules, TimeProvider time)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public IQueryable<Transaction> Query(TxFilter f, IReadOnlyCollection<Category>? categories = null)
    {
        var q = db.Transactions.AsNoTracking().AsQueryable();
        if (f.Range is { } r) q = q.Where(t => t.Date >= r.From && t.Date <= r.To);
        if (f.AccountId is { } a) q = q.Where(t => t.AccountId == a);
        if (f.BatchId is { } b) q = q.Where(t => t.BatchId == b);
        if (f.MemberId is { } m) q = q.Where(t => t.Shares.Any(s => s.MemberId == m && s.Percent > 0));
        q = f.Kind switch
        {
            KindFilter.Expense => q.Where(t => t.Kind == TransactionKind.Expense || (t.Kind == TransactionKind.Refund)),
            KindFilter.Income => q.Where(t => t.Kind == TransactionKind.Income),
            KindFilter.Transfer => q.Where(t => t.Kind == TransactionKind.Transfer || t.Kind == TransactionKind.InvestmentTransfer),
            _ => q,
        };
        if (f.CategoryId is { } cid && categories is not null)
        {
            var ids = CategoryService.WithDescendants(categories, cid).ToList();
            q = q.Where(t => (t.CategoryId != null && ids.Contains(t.CategoryId.Value)) || t.Splits.Any(s => ids.Contains(s.CategoryId)));
        }
        if (f.Split) q = q.Where(t => t.Splits.Any());
        if (f.Unconfirmed) q = q.Where(t => t.Status == TransactionStatus.Suggested);
        if (f.ConfirmedOnly) q = q.Where(t => t.Status == TransactionStatus.Confirmed);
        if (f.Recurring) q = q.Where(t => t.IsRecurring);
        if (f.Excluded) q = q.Where(t => t.ExcludeFromStats && t.Kind != TransactionKind.Correction);
        if (f.Corrections) q = q.Where(t => t.Kind == TransactionKind.Correction);
        if (f.Uncategorized)
            q = q.Where(t => t.CategoryId == null && !t.Splits.Any() && t.Kind != TransactionKind.Transfer
                             && t.Kind != TransactionKind.InvestmentTransfer && t.Kind != TransactionKind.Correction);
        if (f.Suspected) q = q.Where(t => t.SuspectedDuplicateOfId != null);
        if (!string.IsNullOrWhiteSpace(f.Search))
        {
            var s = f.Search.Trim().ToLower();
            var digits = new string(s.Where(ch => char.IsDigit(ch) || ch == ',' || ch == '.').ToArray()).Replace(',', '.');
            decimal? amount = decimal.TryParse(digits, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;
            q = q.Where(t => t.Counterparty.ToLower().Contains(s) || (t.Message != null && t.Message.ToLower().Contains(s))
                             || (t.RawText != null && t.RawText.ToLower().Contains(s)) || (t.Note != null && t.Note.ToLower().Contains(s))
                             || (amount != null && (t.Amount == amount || t.Amount == -amount)));
        }
        return f.Sort switch
        {
            TxSort.AmountDesc => q.OrderByDescending(t => t.AmountCzk < 0 ? -t.AmountCzk : t.AmountCzk).ThenByDescending(t => t.Date),
            TxSort.DateAsc => q.OrderBy(t => t.Date).ThenBy(t => t.Time).ThenBy(t => t.Id),
            _ => q.OrderByDescending(t => t.Date).ThenByDescending(t => t.Time).ThenByDescending(t => t.Id),
        };
    }

    public async Task<TxPage> ListAsync(TxFilter f)
    {
        var cats = f.CategoryId is null ? null : await db.Categories.AsNoTracking().ToListAsync();
        var q = Query(f, cats);
        var total = await q.CountAsync();
        var items = await q.Include(t => t.Splits).Include(t => t.Shares).Skip(f.Skip).Take(Math.Clamp(f.Take, 1, 1000)).ToListAsync();
        var pairs = await PairAccountsAsync(items);
        return new TxPage(items.Select(t => ToRow(t, pairs)).ToList(), total);
    }

    private async Task<Dictionary<int, int>> PairAccountsAsync(IEnumerable<Transaction> items)
    {
        var ids = items.Where(t => t.TransferPairId != null).Select(t => t.TransferPairId!.Value).ToList();
        if (ids.Count == 0) return [];
        return await db.Transactions.AsNoTracking().Where(t => ids.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.AccountId);
    }

    public static TxRow ToRow(Transaction t, IReadOnlyDictionary<int, int>? pairAccounts = null) => new(
        t.Id, t.Date, t.Time, t.AccountId, t.Amount, t.Currency, t.AmountCzk, t.FxRate, t.Counterparty, t.Message, t.Kind, t.Status,
        t.CategoryId, t.NeedOverride,
        t.Splits.OrderBy(s => s.SortOrder).Select(s => new SplitDto(s.CategoryId, s.Amount, Math.Round(s.Amount * t.FxRate, 2), s.NeedOverride)).ToList(),
        t.Shares.Select(s => new ShareDto(s.MemberId, s.Percent)).ToList(), t.SharesOverridden, t.IsRecurring, t.ExcludeFromStats,
        t.CategorySource, t.AiConfidence, t.TransferPairId,
        t.TransferPairId is { } p && pairAccounts is not null && pairAccounts.TryGetValue(p, out var pa) ? pa : null,
        t.RefundOfId, t.SuspectedDuplicateOfId, t.BatchId, t.PaymentType, t.RecurringPaymentId, t.Note);

    public async Task<TxDetail> GetAsync(int id)
    {
        var t = await db.Transactions.AsNoTracking().Include(x => x.Splits).Include(x => x.Shares).Include(x => x.Events)
            .Include(x => x.Batch).FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Pohyb {id} neexistuje.");
        async Task<TxRef?> Ref(int? rid)
        {
            if (rid is not { } r) return null;
            var x = await db.Transactions.AsNoTracking().Include(y => y.Batch).FirstOrDefaultAsync(y => y.Id == r);
            return x is null ? null : new TxRef(x.Id, x.Date, x.AccountId, x.Counterparty, x.Amount, x.Currency, x.AmountCzk, x.RawText, x.BatchId, x.Batch?.Source.ToString());
        }
        var pair = await Ref(t.TransferPairId);
        string? rule = null;
        if (t.AppliedRuleId is { } rid)
        {
            var r = await db.Rules.AsNoTracking().Include(x => x.Conditions).FirstOrDefaultAsync(x => x.Id == rid);
            if (r is not null) rule = RuleEngine.Describe(r);
        }
        decimal? cnb = null;
        if (t.Currency != "CZK")
            cnb = (await db.ExchangeRates.AsNoTracking().Where(x => x.Currency == t.Currency && x.Date <= t.Date).OrderByDescending(x => x.Date).FirstOrDefaultAsync())?.Rate;
        return new TxDetail(ToRow(t, pair is null ? null : new Dictionary<int, int> { [pair.Id] = pair.AccountId }), t.RawText, t.CounterpartyAccount, t.Mcc,
            t.AiReason, ParseAlternatives(t.AiAlternatives), rule,
            t.Events.OrderBy(e => e.At).Select(e => new TxEventDto(e.At, e.Actor, e.Text)).ToList(),
            pair, await Ref(t.RefundOfId), await Ref(t.SuspectedDuplicateOfId), cnb, t.CardHolderMemberId,
            t.Batch is null ? null : $"{(t.Batch.Source == BatchSource.Mcp ? "MCP" : t.Batch.Source == BatchSource.Manual ? "ručně" : "banka")} · {t.Batch.CreatedAt:d. M. yyyy}",
            t.Kind == TransactionKind.Correction || t.Batch?.Source == BatchSource.Manual);
    }

    public static List<AiAlternative> ParseAlternatives(string? json)
    {
        if (string.IsNullOrEmpty(json)) return [];
        try { return JsonSerializer.Deserialize<List<AiAlternative>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    private async Task<Transaction> LoadAsync(int id) =>
        await db.Transactions.Include(x => x.Splits).Include(x => x.Shares).Include(x => x.Account).ThenInclude(a => a!.Shares)
            .FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Pohyb {id} neexistuje.");

    /// <summary>Ruční změna pohybu (web nebo MCP na pokyn uživatele).</summary>
    public async Task<TxRow> UpdateAsync(int id, TxUpdate u, string actor)
    {
        var t = await LoadAsync(id);
        var now = time.GetUtcNow();
        var cats = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id);
        var events = new List<string>();

        if (u.Splits is { } splits)
        {
            if (splits.Count == 0)
            {
                if (t.IsSplit)
                {
                    t.CategoryId ??= t.Splits.OrderBy(s => s.SortOrder).First().CategoryId;
                    t.Splits.Clear();
                    events.Add("Rozdělení zrušeno");
                }
            }
            else
            {
                ValidateSplits(t, splits, cats);
                t.Splits.Clear();
                var i = 0;
                foreach (var s in splits) t.Splits.Add(new TransactionSplit { CategoryId = s.CategoryId, Amount = s.Amount, NeedOverride = s.NeedOverride, SortOrder = i++ });
                t.CategoryId = null;
                t.CategorySource = CategorySource.Manual;
                t.AppliedRuleId = null;
                events.Add($"Rozděleno na {splits.Count} části");
            }
        }
        if (u.SetCategory)
        {
            if (u.CategoryId is { } cid)
            {
                if (!cats.TryGetValue(cid, out var c)) throw new DomainException($"Kategorie {cid} neexistuje.");
                EnsureKindFits(t, c);
                t.Splits.Clear();
                if (t.CategoryId != cid) events.Add($"Zařazeno do {c.Name}");
            }
            t.CategoryId = u.CategoryId;
            t.CategorySource = u.CategoryId is null ? null : CategorySource.Manual;
            t.AppliedRuleId = null;
        }
        if (u.SetNeed) t.NeedOverride = u.NeedOverride is NeedType.Inherit ? null : u.NeedOverride;
        if (u.SetMember || u.Shares is not null)
        {
            if (u.Shares is { Count: > 0 } shares)
            {
                ShareService.Validate(shares.ToDictionary(s => s.MemberId, s => s.Percent));
                ShareService.Apply(t, shares.Select(s => new TransactionShare { MemberId = s.MemberId, Percent = s.Percent }));
                t.SharesOverridden = true;
            }
            else if (u.MemberId is { } mid)
            {
                if (!await db.Members.AnyAsync(m => m.Id == mid)) throw new DomainException($"Člen {mid} neexistuje.");
                ShareService.Apply(t, [new TransactionShare { MemberId = mid, Percent = 100 }]);
                t.SharesOverridden = true;
            }
            else
            {
                ShareService.Apply(t, ShareService.Compute(t.Account!, t.Date, t.PaymentType, t.CardHolderMemberId));
                t.SharesOverridden = false;
            }
            events.Add("Změněn člen / podíly");
        }
        if (u.ExcludeFromStats is { } ex && ex != t.ExcludeFromStats)
        {
            if (t.Kind == TransactionKind.Correction && !ex) throw new DomainException("Korekce zůstatku se do statistik nezapočítává nikdy.");
            t.ExcludeFromStats = ex;
            events.Add(ex ? "Označeno „nezapočítávat“" : "Znovu se započítává do statistik");
        }
        if (u.IsRecurring is { } rec && rec != t.IsRecurring)
        {
            t.IsRecurring = rec;
            if (!rec) t.RecurringPaymentId = null;
            events.Add(rec ? "Označeno jako pravidelná" : "Už není pravidelná");
        }
        if (u.Note is not null) t.Note = u.Note.Length == 0 ? null : u.Note.Trim();
        if (u.SetRefundOf)
        {
            if (u.RefundOfId is { } rid)
            {
                var orig = await db.Transactions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == rid) ?? throw new DomainException($"Pohyb {rid} neexistuje.");
                if (t.Amount <= 0 || orig.Amount >= 0) throw new DomainException("Vratka musí být příchozí platba k odchozí platbě.");
                t.Kind = TransactionKind.Refund;
                t.RefundOfId = rid;
                if (!t.IsCategorized) t.CategoryId = orig.CategoryId;
                events.Add($"Vratka k platbě {orig.Counterparty}");
            }
            else if (t.Kind == TransactionKind.Refund)
            {
                t.Kind = TransactionKind.Income;
                t.RefundOfId = null;
            }
        }
        if (u.Confirm == true && t.Status != TransactionStatus.Confirmed)
        {
            if (!t.IsCategorized && t.Kind is not (TransactionKind.Transfer or TransactionKind.InvestmentTransfer or TransactionKind.Correction))
                throw new DomainException("Nezařazenou platbu nelze potvrdit – nejdřív vyber kategorii.");
            t.Status = TransactionStatus.Confirmed;
            t.ConfirmedAt = now;
            events.Add($"Potvrdil{(actor.Contains('(') ? "o" : "")} {actor}");
        }
        else if (u.Confirm == false && t.Status == TransactionStatus.Confirmed)
        {
            t.Status = TransactionStatus.Suggested;
            t.ConfirmedAt = null;
        }
        foreach (var e in events.Where(e => !e.StartsWith("Potvrdil"))) t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = e });
        if (events.FirstOrDefault(e => e.StartsWith("Potvrdil")) is { }) t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = "Potvrzeno" });
        await db.SaveChangesAsync();

        if (u.CreateRule && t.CategoryId is { } ruleCat)
            await rules.CreateFromTransactionAsync(t, ruleCat, RuleSource.Inbox, u.ApplyRuleToHistory);
        await batches.RecomputeAsync([t.BatchId]);
        return ToRow(t);
    }

    private static void EnsureKindFits(Transaction t, Category c)
    {
        if (t.Kind is TransactionKind.Transfer or TransactionKind.InvestmentTransfer)
            throw new DomainException("Převod se nekategorizuje. Nejdřív ho rozpáruj.");
        if (t.Kind == TransactionKind.Correction) throw new DomainException("Korekce zůstatku se nekategorizuje.");
        _ = c;
    }

    private static void ValidateSplits(Transaction t, List<SplitInput> splits, IReadOnlyDictionary<int, Category> cats)
    {
        if (t.Kind is TransactionKind.Transfer or TransactionKind.InvestmentTransfer or TransactionKind.Correction)
            throw new DomainException("Převod ani korekci nelze rozdělit.");
        if (splits.Count < 2) throw new DomainException("Rozdělení musí mít aspoň dvě části.");
        foreach (var s in splits)
        {
            if (!cats.ContainsKey(s.CategoryId)) throw new DomainException($"Kategorie {s.CategoryId} neexistuje.");
            if (s.Amount == 0 || Math.Sign(s.Amount) != Math.Sign(t.Amount))
                throw new DomainException("Každá část musí mít nenulovou částku se stejným znaménkem jako platba.");
        }
        var sum = splits.Sum(s => s.Amount);
        if (Math.Abs(sum - t.Amount) > 0.005m)
            throw new DomainException($"Součet částí ({sum:0.##}) neodpovídá částce platby ({t.Amount:0.##}).");
    }

    public async Task<int> ConfirmAsync(IEnumerable<int> ids, string actor)
    {
        var list = ids.Distinct().ToList();
        var txs = await db.Transactions.Include(t => t.Splits).Where(t => list.Contains(t.Id)).ToListAsync();
        var now = time.GetUtcNow();
        var n = 0;
        foreach (var t in txs.Where(t => t.Status == TransactionStatus.Suggested))
        {
            if (!t.IsCategorized && t.Kind is TransactionKind.Expense or TransactionKind.Income or TransactionKind.Refund) continue;
            t.Status = TransactionStatus.Confirmed;
            t.ConfirmedAt = now;
            t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = "Potvrzeno" });
            n++;
        }
        await db.SaveChangesAsync();
        await batches.RecomputeAsync(txs.Select(t => t.BatchId));
        return n;
    }

    /// <summary>Hromadné zařazení (fronta „Zařadit do…“) nebo nastavení typu výdaje.</summary>
    public async Task<int> BulkAsync(IEnumerable<int> ids, int? categoryId, NeedType? need, bool confirm, string actor)
    {
        var n = 0;
        foreach (var id in ids.Distinct())
        {
            await UpdateAsync(id, new TxUpdate(CategoryId: categoryId, SetCategory: categoryId is not null, NeedOverride: need, SetNeed: need is not null,
                Confirm: confirm ? true : null), actor);
            n++;
        }
        return n;
    }

    /// <summary>Návrhy kategorií od AI (MCP). Ručně zařazené a potvrzené pohyby se nemění.</summary>
    public async Task<SuggestResult> SuggestAsync(IReadOnlyList<AiSuggestion> suggestions, string actor)
    {
        var threshold = (await db.Households.AsNoTracking().FirstAsync()).Settings.AiAutoConfirmThreshold;
        var cats = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id);
        var now = time.GetUtcNow();
        int applied = 0, auto = 0;
        var skipped = new List<string>();
        var batchIds = new List<int?>();
        foreach (var s in suggestions)
        {
            var t = await db.Transactions.Include(x => x.Splits).FirstOrDefaultAsync(x => x.Id == s.TransactionId);
            if (t is null) { skipped.Add($"{s.TransactionId}: pohyb neexistuje"); continue; }
            if (t.Status == TransactionStatus.Confirmed) { skipped.Add($"{t.Id}: už je potvrzený"); continue; }
            if (t.CategorySource == CategorySource.Manual) { skipped.Add($"{t.Id}: zařazen ručně"); continue; }
            if (t.Kind is TransactionKind.Transfer or TransactionKind.InvestmentTransfer or TransactionKind.Correction)
            { skipped.Add($"{t.Id}: převod/korekce se nekategorizuje"); continue; }
            var confidence = Math.Clamp(s.Confidence, 0, 100);
            try
            {
                if (s.Splits is { Count: > 0 } splits)
                {
                    ValidateSplits(t, splits, cats);
                    t.Splits.Clear();
                    var i = 0;
                    foreach (var p in splits) t.Splits.Add(new TransactionSplit { CategoryId = p.CategoryId, Amount = p.Amount, NeedOverride = p.NeedOverride, SortOrder = i++ });
                    t.CategoryId = null;
                }
                else if (s.CategoryId is { } cid && cats.ContainsKey(cid))
                {
                    t.Splits.Clear();
                    t.CategoryId = cid;
                }
                else { skipped.Add($"{t.Id}: chybí platná kategorie"); continue; }
            }
            catch (DomainException e) { skipped.Add($"{t.Id}: {e.Message}"); continue; }
            t.CategorySource = CategorySource.Ai;
            t.AppliedRuleId = null;
            t.AiConfidence = confidence;
            t.AiReason = s.Reason?.Trim();
            t.AiAlternatives = s.Alternatives is { Count: > 0 } alts
                ? JsonSerializer.Serialize(alts.Where(a => cats.ContainsKey(a.CategoryId)).Take(5), Json) : null;
            var what = t.IsSplit ? $"rozdělení na {t.Splits.Count} části" : cats[t.CategoryId!.Value].Name;
            t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = $"AI navrhla {what} (jistota {confidence} %)" });
            if (confidence >= threshold)
            {
                t.Status = TransactionStatus.Confirmed;
                t.ConfirmedAt = now;
                t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = $"Potvrzeno automaticky (práh {threshold} %)" });
                auto++;
            }
            applied++;
            batchIds.Add(t.BatchId);
        }
        await db.SaveChangesAsync();
        await batches.RecomputeAsync(batchIds);
        return new SuggestResult(applied, auto, skipped);
    }

    /// <summary>Podezřelá duplicita: zahodit (smaže pohyb) nebo ponechat obě.</summary>
    public async Task ResolveDuplicateAsync(int id, bool keep, string actor)
    {
        var t = await db.Transactions.FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Pohyb {id} neexistuje.");
        if (t.SuspectedDuplicateOfId is null) throw new DomainException("Pohyb není označený jako podezřelá duplicita.");
        if (keep)
        {
            t.SuspectedDuplicateOfId = null;
            t.Events.Add(new TransactionEvent { At = time.GetUtcNow(), Actor = actor, Text = "Není duplicita – ponecháno" });
        }
        else
        {
            await DeleteInternalAsync(t);
        }
        await db.SaveChangesAsync();
        await batches.RecomputeAsync([t.BatchId]);
    }

    /// <summary>Smazání pohybu – jen ručně přidané pohyby a korekce (importované se neodstraňují, jen vyřazují).</summary>
    public async Task DeleteAsync(int id)
    {
        var t = await db.Transactions.Include(x => x.Batch).FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Pohyb {id} neexistuje.");
        if (t.Kind != TransactionKind.Correction && t.Batch?.Source != BatchSource.Manual)
            throw new DomainException("Smazat jde jen ručně přidaný pohyb nebo korekci. Importovaný pohyb označ „nezapočítávat“.");
        await DeleteInternalAsync(t);
        await db.SaveChangesAsync();
        await batches.RecomputeAsync([t.BatchId]);
    }

    private async Task DeleteInternalAsync(Transaction t)
    {
        foreach (var o in await db.Transactions.Where(x => x.TransferPairId == t.Id || x.RefundOfId == t.Id || x.SuspectedDuplicateOfId == t.Id).ToListAsync())
        {
            if (o.TransferPairId == t.Id)
            {
                o.TransferPairId = null;
                o.Kind = o.Amount < 0 ? TransactionKind.Expense : TransactionKind.Income;
                o.CategorySource = null;
                o.Status = TransactionStatus.Suggested;
            }
            if (o.RefundOfId == t.Id) o.RefundOfId = null;
            if (o.SuspectedDuplicateOfId == t.Id) o.SuspectedDuplicateOfId = null;
        }
        foreach (var tr in await db.InvestmentTrades.Where(x => x.LinkedTransactionId == t.Id).ToListAsync()) tr.LinkedTransactionId = null;
        if (t.BatchId is { } bid && await db.ImportBatches.FindAsync(bid) is { } batch)
        {
            batch.Count = Math.Max(0, batch.Count - 1);
            if (t.SuspectedDuplicateOfId is not null) batch.DuplicateCount++;
        }
        db.Transactions.Remove(t);
    }
}

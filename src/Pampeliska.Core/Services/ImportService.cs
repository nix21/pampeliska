using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>Jeden pohyb z výpisu. Částka v měně účtu, záporná = odchozí.</summary>
public record ImportItem(
    DateOnly Date,
    decimal Amount,
    string? Counterparty = null,
    TimeOnly? Time = null,
    string? Currency = null,
    string? CounterpartyAccount = null,
    string? Message = null,
    string? RawText = null,
    PaymentType? PaymentType = null,
    string? Mcc = null,
    string? ExternalId = null,
    int? CardHolderMemberId = null,
    string? Note = null);

/// <param name="PeriodFrom">Začátek období výpisu (z hlavičky výpisu); bez něj první pohyb.</param>
/// <param name="PeriodTo">Konec období výpisu; bez něj poslední pohyb.</param>
public record ImportOptions(BatchSource Source, string Actor, int? MemberId = null, string? ClientId = null, string? ClientName = null,
    string? Note = null, int? BatchId = null, DateOnly? PeriodFrom = null, DateOnly? PeriodTo = null)
{
    /// <summary>Výpis z účtu (MCP, banka, e-mail) – páruje předběžné pohyby z notifikací a hodnotí, co ve výpisu chybí.</summary>
    public bool IsStatement => Source is BatchSource.Mcp or BatchSource.EnableBanking or BatchSource.EmailStatement;
}

/// <param name="Reconciled">Předběžné pohyby z notifikací, které výpis potvrdil (nevznikly znovu).</param>
/// <param name="NotInStatement">Předběžné pohyby uvnitř období výpisu, které ve výpisu chybí.</param>
public record ImportResult(int BatchId, int Created, int SkippedDuplicates, int SuspectedDuplicates, int CategorizedByRule,
    int Transfers, int Uncategorized, IReadOnlyList<int> TransactionIds, int Reconciled = 0, int NotInStatement = 0);

/// <summary>
/// Jediná vstupní brána pohybů (MCP, ruční zadání, později Enable Banking): deduplikace, převody, pravidla,
/// podíly členů, párování pravidelných plateb a založení dávky.
/// </summary>
public class ImportService(AppDbContext db, FxService fx, TransferMatcher transfers, TimeProvider time)
{
    public const int MaxItems = 2000;

    public static string DedupKey(int accountId, DateOnly date, decimal amount, string? counterparty) =>
        $"{accountId}|{date:yyyyMMdd}|{amount.ToString("0.00", CultureInfo.InvariantCulture)}|{Text.Normalize(counterparty)}";

    public async Task<ImportResult> ImportAsync(int accountId, IReadOnlyList<ImportItem> items, ImportOptions opt)
    {
        if (items.Count == 0) throw new DomainException("Import neobsahuje žádné pohyby.");
        if (items.Count > MaxItems) throw new DomainException($"Najednou lze importovat nejvýš {MaxItems} pohybů.");
        var account = await db.Accounts.Include(a => a.Shares).FirstOrDefaultAsync(a => a.Id == accountId)
            ?? throw new DomainException($"Účet {accountId} neexistuje.");
        if (account.Archived) throw new DomainException($"Účet {account.Name} je archivovaný.");
        foreach (var i in items)
        {
            if (i.Currency is { Length: > 0 } c && !string.Equals(c, account.Currency, StringComparison.OrdinalIgnoreCase))
                throw new DomainException($"Pohyb {i.Date:d. M.} {i.Counterparty} je v {c}, účet {account.Name} je v {account.Currency}. Pošli částku v měně účtu.");
        }

        if (opt.PeriodFrom is { } pf && opt.PeriodTo is { } pt && pt < pf) throw new DomainException("Konec období výpisu je před jeho začátkem.");

        var settings = (await db.Households.AsNoTracking().FirstAsync()).Settings;
        var now = time.GetUtcNow();
        var batch = opt.BatchId is { } bid
            ? await db.ImportBatches.FirstOrDefaultAsync(b => b.Id == bid) ?? throw new DomainException($"Dávka {bid} neexistuje.")
            : null;
        if (batch is { State: BatchState.Confirmed }) throw new DomainException("Do potvrzené dávky už nejde přidávat.");
        batch ??= new ImportBatch
        {
            CreatedAt = now, Source = opt.Source, CreatedByMemberId = opt.MemberId, OAuthClientId = opt.ClientId,
            ClientName = opt.ClientName, Note = opt.Note, State = BatchState.Uploaded,
        };
        if (batch.Id == 0) db.ImportBatches.Add(batch);

        var otherAccounts = await db.Accounts.AsNoTracking().Where(a => a.Id != accountId).ToListAsync();
        var rules = await db.Rules.AsNoTracking().Include(r => r.Conditions).Where(r => r.Enabled).OrderBy(r => r.Priority).ToListAsync();
        var recurring = await db.RecurringPayments.AsNoTracking()
            .Where(r => r.AccountId == accountId && r.Status == RecurringStatus.Active).ToListAsync();

        // ---- Deduplikace ----
        var keys = items.Select(i => DedupKey(accountId, i.Date, i.Amount, i.Counterparty)).Distinct().ToList();
        // Předběžné pohyby z notifikací řeší u výpisu párování (níže). Další notifikace se stejným klíčem (dvě stejné platby za den)
        // vznikne a označí se jako podezřelá duplicita – opakované doručení téhož e-mailu zachytí už Message-ID.
        var skipProvisional = opt.IsStatement || opt.Source == BatchSource.Email;
        var existingByKey = (await db.Transactions.AsNoTracking()
                .Where(t => t.AccountId == accountId && keys.Contains(t.DedupKey) && !(skipProvisional && t.Provisional))
                .Select(t => new { t.Id, t.DedupKey, t.ExternalId }).ToListAsync())
            .GroupBy(t => t.DedupKey).ToDictionary(g => g.Key, g => g.ToList());
        var externalIds = items.Where(i => i.ExternalId is { Length: > 0 }).Select(i => i.ExternalId!).Distinct().ToList();
        var existingExternal = (await db.Transactions.AsNoTracking()
                .Where(t => t.AccountId == accountId && t.ExternalId != null && externalIds.Contains(t.ExternalId))
                .Select(t => new { t.Id, t.ExternalId }).ToListAsync())
            .ToDictionary(t => t.ExternalId!, t => t.Id);
        var usedKeyCount = new Dictionary<string, int>();
        var seenExternal = new HashSet<string>();

        var created = new List<Transaction>();
        var pairs = new List<(Transaction A, Transaction B)>();
        int skipped = 0, suspected = 0, byRule = 0, transferCount = 0;
        var minDate = items.Min(i => i.Date).AddDays(-settings.DedupWindowDays);
        var maxDate = items.Max(i => i.Date).AddDays(settings.DedupWindowDays);
        var nearby = await db.Transactions.AsNoTracking()
            .Where(t => t.AccountId == accountId && t.Date >= minDate && t.Date <= maxDate)
            .Select(t => new { t.Id, t.Date, t.Amount, t.Counterparty, t.DedupKey, t.Provisional }).ToListAsync();

        // ---- Předběžné pohyby z e-mailových notifikací (jen u výpisu) ----
        var provisional = new List<Transaction>();
        if (opt.IsStatement)
        {
            var pFrom = items.Min(i => i.Date).AddDays(-StatementMatcher.DaysBefore);
            var pTo = items.Max(i => i.Date).AddDays(StatementMatcher.DaysAfter);
            provisional = await db.Transactions.Include(t => t.Splits)
                .Where(t => t.AccountId == accountId && t.Provisional && t.Date >= pFrom && t.Date <= pTo).ToListAsync();
        }
        var reconciled = new HashSet<int>();

        foreach (var item in items.OrderBy(i => i.Date).ThenBy(i => i.Time))
        {
            var key = DedupKey(accountId, item.Date, item.Amount, item.Counterparty);
            int? duplicateOf = null;
            if (item.ExternalId is { Length: > 0 } ext)
            {
                if (existingExternal.TryGetValue(ext, out var exId)) duplicateOf = exId;
                else if (!seenExternal.Add(ext)) duplicateOf = 0;
            }
            if (duplicateOf is null && provisional.Count > 0
                && StatementMatcher.Match(item, provisional.Where(p => !reconciled.Contains(p.Id))
                    .Select(p => new StatementMatcher.Candidate(p.Id, p.Date, p.Amount, p.Counterparty, p.PaymentType))) is { } pid)
            {
                await ReconcileAsync(provisional.First(p => p.Id == pid), item, account, settings.FxMode, opt.Actor, now);
                reconciled.Add(pid);
                continue;
            }
            if (duplicateOf is null)
            {
                // Stejný klíč (účet, datum, částka, protistrana): nový pohyb vznikne, jen když jich výpis obsahuje víc než DB
                var same = existingByKey.GetValueOrDefault(key) ?? [];
                var comparable = item.ExternalId is { Length: > 0 } ? same.Where(s => s.ExternalId == null).ToList() : same;
                var used = usedKeyCount.GetValueOrDefault(key);
                if (used < comparable.Count) duplicateOf = comparable[used].Id;
                usedKeyCount[key] = used + 1;
            }
            if (duplicateOf is not null)
            {
                skipped++;
                batch.SkippedDuplicates.Add(new SkippedDuplicate
                {
                    ExistingTransactionId = duplicateOf == 0 ? null : duplicateOf, Date = item.Date, Amount = item.Amount,
                    Counterparty = item.Counterparty ?? "", Payload = JsonSerializer.Serialize(item),
                });
                continue;
            }

            var rate = await fx.RateAsync(account.Currency, item.Date, settings.FxMode);
            var t = new Transaction
            {
                AccountId = accountId, Account = account, Batch = batch, Date = item.Date, Time = item.Time, Amount = item.Amount,
                Currency = account.Currency, FxRate = rate, AmountCzk = Math.Round(item.Amount * rate, 2),
                Counterparty = (item.Counterparty ?? "").Trim(), CounterpartyAccount = Clean(item.CounterpartyAccount),
                Message = Clean(item.Message), RawText = Clean(item.RawText), Mcc = Clean(item.Mcc),
                PaymentType = item.PaymentType ?? PaymentType.Other, ExternalId = Clean(item.ExternalId),
                CardHolderMemberId = item.CardHolderMemberId, Note = Clean(item.Note),
                Kind = item.Amount < 0 ? TransactionKind.Expense : TransactionKind.Income,
                Status = TransactionStatus.Suggested, DedupKey = key, CreatedAt = now,
            };
            t.Events.Add(new TransactionEvent { At = now, Actor = opt.Actor, Text = opt.Source switch
            {
                BatchSource.Mcp => $"Importováno přes MCP{(opt.ClientName is { } cn ? $" ({cn})" : "")}",
                BatchSource.EnableBanking => "Staženo z banky (Enable Banking)",
                BatchSource.Email => "Z e-mailové notifikace banky",
                BatchSource.EmailStatement => "Z výpisu poslaného e-mailem",
                _ => "Přidáno ručně",
            } });

            // Podobná platba v okně dnů (jiný den nebo mírně jiný text) = podezřelá duplicita k ručnímu vyřešení
            var similar = nearby.FirstOrDefault(n => (n.DedupKey != key || skipProvisional && n.Provisional) && n.Amount == item.Amount && !reconciled.Contains(n.Id)
                                                      && Math.Abs(n.Date.DayNumber - item.Date.DayNumber) <= settings.DedupWindowDays
                                                      && Text.Similar(n.Counterparty, item.Counterparty));
            if (similar is not null)
            {
                t.SuspectedDuplicateOfId = similar.Id;
                suspected++;
            }

            // Převod: protiúčet je vlastní účet domácnosti, nebo protějšek na jiném účtu s doloženým směrem peněz (TransferMatcher.FlowMatches)
            var ownCounter = otherAccounts.FirstOrDefault(a => AccountNumber.Same(a.Iban, t.CounterpartyAccount));
            var candidates = await transfers.MatchesAsync(t, account, created);
            var match = candidates.FirstOrDefault(c => c.AccountId == ownCounter?.Id) ?? candidates.FirstOrDefault();
            if (match is not null)
            {
                var matchAccount = match.Account ?? otherAccounts.First(a => a.Id == match.AccountId);
                TransferMatcher.Pair(t, match, account, matchAccount);
                pairs.Add((t, match));
                if (db.Entry(match).State == EntityState.Detached) db.Attach(match);
                transferCount++;
            }
            else if (ownCounter is not null)
            {
                TransferMatcher.MarkTransfer(t, account, ownCounter);
                transferCount++;
            }

            ShareService.Apply(t, ShareService.Compute(account, t.Date, t.PaymentType, t.CardHolderMemberId));

            if (RuleEngine.CanApplyTo(t) && RuleEngine.FirstMatch(rules, t) is { } rule)
            {
                RuleEngine.Apply(rule, t);
                t.Events.Add(new TransactionEvent { At = now, Actor = "Pravidla", Text = $"Pravidlo „{RuleEngine.Describe(rule)}“" });
                byRule++;
            }
            if (match is not null && !TransferMatcher.PrefillFromPair(match, t, now)) TransferMatcher.PrefillFromPair(t, match, now);

            if (t.Kind is TransactionKind.Expense or TransactionKind.Income && RecurringSchedule.FindMatch(recurring, t) is { } rec)
            {
                t.RecurringPaymentId = rec.Id;
                t.IsRecurring = true;
            }

            db.Transactions.Add(t);
            created.Add(t);
        }

        batch.Count += created.Count;
        batch.DuplicateCount += skipped;
        batch.SuspectedCount += suspected;
        batch.ReconciledCount += reconciled.Count;
        await db.SaveChangesAsync();
        TransferMatcher.FixPairIds(pairs);

        // ---- Co výpis za své období neobsahuje ----
        var missing = 0;
        if (opt.IsStatement)
        {
            var from = opt.PeriodFrom ?? items.Min(i => i.Date);
            var to = opt.PeriodTo ?? items.Max(i => i.Date);
            batch.PeriodFrom = batch.PeriodFrom is { } bf && bf < from ? bf : from;
            batch.PeriodTo = batch.PeriodTo is { } bt && bt > to ? bt : to;
            if (account.StatementCoveredTo is null || account.StatementCoveredTo < to) account.StatementCoveredTo = to;
            var lower = from.AddDays(-StatementMatcher.DaysBefore);
            var upper = to.AddDays(-StatementMatcher.TailDays);
            var unmatched = await db.Transactions
                .Where(t => t.AccountId == accountId && t.Provisional && !t.NotInStatement && t.Date >= lower && t.Date <= upper).ToListAsync();
            foreach (var t in unmatched.Where(t => StatementMatcher.IsMissing(t.Date, from, to)))
            {
                t.NotInStatement = true;
                t.Events.Add(new TransactionEvent { At = now, Actor = opt.Actor, Text = $"Není ve výpisu za {from:d. M.}–{to:d. M. yyyy}" });
                missing++;
            }
        }

        await BatchService.RecomputeStateAsync(db, batch, now);
        await db.SaveChangesAsync();

        var uncategorized = created.Count(t => !t.IsCategorized && t.NeedsCategory);
        return new ImportResult(batch.Id, created.Count, skipped, suspected, byRule, transferCount, uncategorized,
            created.Select(t => t.Id).ToList(), reconciled.Count, missing);
    }

    /// <summary>
    /// Předběžný pohyb z notifikace převezme údaje z výpisu (datum zaúčtování, texty, částka, id) a přestane být předběžný.
    /// Kategorie, podíly a potvrzení zůstanou.
    /// </summary>
    private async Task ReconcileAsync(Transaction t, ImportItem item, Account account, FxMode fxMode, string actor, DateTimeOffset now)
    {
        var oldAmount = t.Amount;
        t.Date = item.Date;
        if (item.Time is { } time) t.Time = time;
        if (t.Amount != item.Amount)
        {
            t.Amount = item.Amount;
            t.FxRate = await fx.RateAsync(account.Currency, item.Date, fxMode);
            t.AmountCzk = Math.Round(item.Amount * t.FxRate, 2);
            if (t.Splits.Count > 0)
            {
                // Rozdělení by po změně částky nesedělo – zůstane hlavní kategorie
                t.CategoryId ??= t.Splits.OrderByDescending(s => Math.Abs(s.Amount)).First().CategoryId;
                db.TransactionSplits.RemoveRange(t.Splits);
                t.Splits.Clear();
            }
        }
        if (Clean(item.Counterparty) is { } cp) t.Counterparty = cp;
        t.Message = Clean(item.Message) ?? t.Message;
        t.RawText = Clean(item.RawText) ?? t.RawText;
        t.CounterpartyAccount = Clean(item.CounterpartyAccount) ?? t.CounterpartyAccount;
        t.ExternalId = Clean(item.ExternalId) ?? t.ExternalId;
        t.Mcc = Clean(item.Mcc) ?? t.Mcc;
        if (item.PaymentType is { } pt) t.PaymentType = pt;
        t.DedupKey = DedupKey(t.AccountId, t.Date, t.Amount, t.Counterparty);
        t.Provisional = false;
        t.NotInStatement = false;
        t.Events.Add(new TransactionEvent
        {
            At = now, Actor = actor,
            Text = oldAmount == t.Amount ? "Potvrzeno výpisem" : $"Potvrzeno výpisem, částka upravena z {oldAmount.ToString("0.##", CultureInfo.GetCultureInfo("cs-CZ"))}",
        });
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

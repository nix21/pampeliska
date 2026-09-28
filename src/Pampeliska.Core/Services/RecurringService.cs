using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum OccurrenceState { Expected, Paired, Missing, Skipped }

public enum HistoryState { None, Ok, Late, Variable, Higher, Lower, Missing }

public record HistoryCell(string Month, HistoryState State, decimal? Amount, int? DaysLate);

public record RecurringDto(int Id, int AccountId, string Name, string MatchPattern, int? CategoryId, decimal Amount, string Currency, decimal AmountCzk,
    AmountKind AmountKind, int VariancePct, Frequency Frequency, DateOnly AnchorDate, int ToleranceDays, bool IsTransfer, RecurringStatus Status,
    RecurringSource Source, bool MarkedToCancel, string? Note, decimal MonthlyCzk, decimal YearlyCzk, DateOnly? NextDue, IReadOnlyList<HistoryCell> History,
    int PairedCount, decimal? LastAmount, DateOnly? LastDate);

public record Occurrence(int RecurringId, DateOnly Due, OccurrenceState State, int? TransactionId, decimal Amount, decimal AmountCzk, int DaysOverdue);

public record RecurringInput(int? AccountId = null, string? Name = null, string? MatchPattern = null, int? CategoryId = null, bool SetCategory = false,
    decimal? Amount = null, AmountKind? AmountKind = null, int? VariancePct = null, Frequency? Frequency = null, DateOnly? AnchorDate = null,
    int? ToleranceDays = null, bool? IsTransfer = null, bool? MarkedToCancel = null, string? Note = null);

public record RecurringAlert(string Kind, int RecurringId, string Title, string Text, DateOnly? Due, decimal? NewAmount);

/// <summary>Pravidelné platby: detekce návrhů, párování výskytů, nadcházející platby, historie a upozornění.</summary>
public class RecurringService(AppDbContext db, FxService fx, TimeProvider time)
{
    public async Task<List<RecurringDto>> ListAsync(bool includeEnded = false)
    {
        var list = await db.RecurringPayments.AsNoTracking().Where(r => includeEnded || r.Status != RecurringStatus.Ended)
            .OrderBy(r => r.Status).ThenBy(r => r.Name).ToListAsync();
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id);
        var today = time.Today();
        var rates = await fx.LatestAsync(today);
        var ids = list.Select(r => r.Id).ToList();
        var paired = (await db.Transactions.AsNoTracking().Where(t => t.RecurringPaymentId != null && ids.Contains(t.RecurringPaymentId.Value))
                .Select(t => new { t.RecurringPaymentId, t.Date, t.Amount }).ToListAsync())
            .ToLookup(t => t.RecurringPaymentId!.Value);
        var skips = (await db.RecurringSkips.AsNoTracking().Where(s => ids.Contains(s.RecurringPaymentId)).ToListAsync()).ToLookup(s => s.RecurringPaymentId);
        return list.Select(r =>
        {
            var cur = accounts.TryGetValue(r.AccountId, out var a) ? a.Currency : "CZK";
            var rate = rates.GetValueOrDefault(cur, 1m);
            var txs = paired[r.Id].OrderBy(t => t.Date).ToList();
            var history = History(r, txs.Select(t => (t.Date, t.Amount)).ToList(), skips[r.Id].Select(s => s.DueDate).ToHashSet(), today);
            return new RecurringDto(r.Id, r.AccountId, r.Name, r.MatchPattern, r.CategoryId, r.Amount, cur, Math.Round(r.Amount * rate, 2), r.AmountKind,
                r.VariancePct, r.Frequency, r.AnchorDate, r.ToleranceDays, r.IsTransfer, r.Status, r.Source, r.MarkedToCancel, r.Note,
                Math.Round(RecurringSchedule.MonthlyEquivalent(r) * rate, 2), Math.Round(RecurringSchedule.YearlyEquivalent(r) * rate, 2),
                RecurringSchedule.Occurrences(r, today.AddDays(1), today.AddYears(1)).Cast<DateOnly?>().FirstOrDefault(), history,
                txs.Count, txs.LastOrDefault()?.Amount, txs.LastOrDefault()?.Date);
        }).ToList();
    }

    /// <summary>Stav posledních 4 měsíců (Čvn, Čvc, Srp, Zář…).</summary>
    public static List<HistoryCell> History(RecurringPayment r, IReadOnlyList<(DateOnly Date, decimal Amount)> paired, HashSet<DateOnly> skips, DateOnly today)
    {
        var result = new List<HistoryCell>();
        var start = new DateOnly(today.Year, today.Month, 1).AddMonths(-3);
        for (var i = 0; i < 4; i++)
        {
            var m = start.AddMonths(i);
            var range = DateRange.MonthOf(m);
            var due = RecurringSchedule.Occurrences(r, range.From, range.To).Cast<DateOnly?>().FirstOrDefault();
            var tx = paired.Where(p => range.Contains(p.Date) || (due is { } d && Math.Abs(p.Date.DayNumber - d.DayNumber) <= r.ToleranceDays))
                .Cast<(DateOnly Date, decimal Amount)?>().FirstOrDefault();
            var label = $"{m:yyyy-MM}";
            if (due is null && tx is null) { result.Add(new HistoryCell(label, HistoryState.None, null, null)); continue; }
            if (tx is { } t)
            {
                var late = due is { } dd ? t.Date.DayNumber - dd.DayNumber : 0;
                var diff = Math.Abs(t.Amount) - Math.Abs(r.Amount);
                var tolerance = Math.Abs(r.Amount) * (r.AmountKind == AmountKind.Variable ? r.VariancePct : 2) / 100m;
                var state = Math.Abs(diff) > Math.Max(tolerance, 1) ? (r.AmountKind == AmountKind.Variable ? HistoryState.Variable : diff > 0 ? HistoryState.Higher : HistoryState.Lower)
                    : late > 1 ? HistoryState.Late : HistoryState.Ok;
                result.Add(new HistoryCell(label, state, t.Amount, late > 0 ? late : null));
            }
            else if (due is { } d2 && skips.Contains(d2)) result.Add(new HistoryCell(label, HistoryState.None, null, null));
            else if (due is { } d3 && d3.AddDays(r.ToleranceDays) < today) result.Add(new HistoryCell(label, HistoryState.Missing, null, null));
            else result.Add(new HistoryCell(label, HistoryState.None, null, null));
        }
        return result;
    }

    /// <summary>Výskyty v intervalu se stavem (očekává se / spárováno / chybí / tentokrát nebude).</summary>
    public async Task<List<Occurrence>> OccurrencesAsync(DateOnly from, DateOnly to, int? accountId = null)
    {
        var today = time.Today();
        var list = await db.RecurringPayments.AsNoTracking()
            .Where(r => r.Status == RecurringStatus.Active && (accountId == null || r.AccountId == accountId)).ToListAsync();
        var ids = list.Select(r => r.Id).ToList();
        var paired = (await db.Transactions.AsNoTracking()
                .Where(t => t.RecurringPaymentId != null && ids.Contains(t.RecurringPaymentId.Value) && t.Date >= from.AddDays(-10) && t.Date <= to.AddDays(10))
                .Select(t => new { t.Id, t.RecurringPaymentId, t.Date }).ToListAsync())
            .ToLookup(t => t.RecurringPaymentId!.Value);
        var skips = (await db.RecurringSkips.AsNoTracking().Where(s => ids.Contains(s.RecurringPaymentId)).ToListAsync())
            .Select(s => (s.RecurringPaymentId, s.DueDate)).ToHashSet();
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id);
        var rates = await fx.LatestAsync(today);
        var result = new List<Occurrence>();
        foreach (var r in list)
        {
            var rate = rates.GetValueOrDefault(accounts.TryGetValue(r.AccountId, out var a) ? a.Currency : "CZK", 1m);
            foreach (var due in RecurringSchedule.Occurrences(r, from, to))
            {
                var tx = paired[r.Id].FirstOrDefault(p => Math.Abs(p.Date.DayNumber - due.DayNumber) <= Math.Max(r.ToleranceDays, 5));
                var state = tx is not null ? OccurrenceState.Paired
                    : skips.Contains((r.Id, due)) ? OccurrenceState.Skipped
                    : due.AddDays(r.ToleranceDays) < today ? OccurrenceState.Missing
                    : OccurrenceState.Expected;
                result.Add(new Occurrence(r.Id, due, state, tx?.Id, r.Amount, Math.Round(r.Amount * rate, 2),
                    state == OccurrenceState.Missing ? today.DayNumber - due.DayNumber : 0));
            }
        }
        return result.OrderBy(o => o.Due).ToList();
    }

    public async Task<RecurringPayment> CreateAsync(RecurringInput input, RecurringSource source, RecurringStatus status = RecurringStatus.Active)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) throw new DomainException("Pravidelná platba musí mít název.");
        if (input.AccountId is not { } acc || !await db.Accounts.AnyAsync(a => a.Id == acc)) throw new DomainException("Vyber účet.");
        if (input.Amount is not { } amt || amt == 0) throw new DomainException("Zadej očekávanou částku (záporná = odchozí).");
        var r = new RecurringPayment
        {
            AccountId = acc, Name = input.Name.Trim(), MatchPattern = (input.MatchPattern ?? input.Name).Trim(), CategoryId = input.CategoryId, Amount = amt,
            AmountKind = input.AmountKind ?? AmountKind.Fixed, VariancePct = input.VariancePct ?? 10, Frequency = input.Frequency ?? Frequency.Monthly,
            AnchorDate = input.AnchorDate ?? time.Today(), ToleranceDays = input.ToleranceDays ?? 3, IsTransfer = input.IsTransfer ?? false,
            Status = status, Source = source, Note = input.Note, CreatedAt = time.GetUtcNow(),
        };
        db.RecurringPayments.Add(r);
        await db.SaveChangesAsync();
        if (status == RecurringStatus.Active) await PairHistoryAsync(r);
        return r;
    }

    public async Task<RecurringPayment> UpdateAsync(int id, RecurringInput input)
    {
        var r = await db.RecurringPayments.FindAsync(id) ?? throw new DomainException($"Pravidelná platba {id} neexistuje.");
        if (input.Name is { } n && !string.IsNullOrWhiteSpace(n)) r.Name = n.Trim();
        if (input.MatchPattern is { } p) r.MatchPattern = p.Trim();
        if (input.SetCategory) r.CategoryId = input.CategoryId;
        if (input.Amount is { } a && a != 0) r.Amount = a;
        if (input.AmountKind is { } k) r.AmountKind = k;
        if (input.VariancePct is { } v) r.VariancePct = Math.Clamp(v, 1, 100);
        if (input.Frequency is { } f) r.Frequency = f;
        if (input.AnchorDate is { } d) r.AnchorDate = d;
        if (input.ToleranceDays is { } t) r.ToleranceDays = Math.Clamp(t, 0, 14);
        if (input.IsTransfer is { } tr) r.IsTransfer = tr;
        if (input.MarkedToCancel is { } mc) r.MarkedToCancel = mc;
        if (input.Note is not null) r.Note = input.Note.Length == 0 ? null : input.Note;
        if (input.AccountId is { } acc) r.AccountId = acc;
        await db.SaveChangesAsync();
        return r;
    }

    public async Task ConfirmSuggestionAsync(int id)
    {
        var r = await db.RecurringPayments.FindAsync(id) ?? throw new DomainException($"Pravidelná platba {id} neexistuje.");
        r.Status = RecurringStatus.Active;
        await db.SaveChangesAsync();
        await PairHistoryAsync(r);
    }

    public async Task EndAsync(int id, bool delete = false)
    {
        var r = await db.RecurringPayments.FindAsync(id) ?? throw new DomainException($"Pravidelná platba {id} neexistuje.");
        if (delete || r.Status == RecurringStatus.Suggested)
        {
            foreach (var t in await db.Transactions.Where(t => t.RecurringPaymentId == id).ToListAsync()) t.RecurringPaymentId = null;
            db.RecurringSkips.RemoveRange(await db.RecurringSkips.Where(s => s.RecurringPaymentId == id).ToListAsync());
            db.RecurringPayments.Remove(r);
        }
        else
        {
            r.Status = RecurringStatus.Ended;
            r.EndedAt = time.Today();
        }
        await db.SaveChangesAsync();
    }

    /// <summary>Upozornění na změněnou částku: přijmout novou částku, nebo brát jako jednorázovou.</summary>
    public async Task ResolveAmountAlertAsync(int id, bool acceptNewAmount)
    {
        var r = await db.RecurringPayments.FindAsync(id) ?? throw new DomainException($"Pravidelná platba {id} neexistuje.");
        var last = await db.Transactions.AsNoTracking().Where(t => t.RecurringPaymentId == id).OrderByDescending(t => t.Date).FirstOrDefaultAsync()
            ?? throw new DomainException("K pravidelné platbě zatím není spárovaný žádný pohyb.");
        if (acceptNewAmount) r.Amount = last.Amount;
        r.AmountAlertDismissedFor = last.Date;
        await db.SaveChangesAsync();
    }

    /// <summary>„Tentokrát nebude“ – výskyt se nepočítá jako chybějící ani do výhledu.</summary>
    public async Task SkipAsync(int id, DateOnly due)
    {
        if (!await db.RecurringSkips.AnyAsync(s => s.RecurringPaymentId == id && s.DueDate == due))
            db.RecurringSkips.Add(new RecurringSkip { RecurringPaymentId = id, DueDate = due });
        await db.SaveChangesAsync();
    }

    /// <summary>Ruční spárování pohybu s pravidelnou platbou.</summary>
    public async Task PairAsync(int id, int transactionId)
    {
        var r = await db.RecurringPayments.FindAsync(id) ?? throw new DomainException($"Pravidelná platba {id} neexistuje.");
        var t = await db.Transactions.FindAsync(transactionId) ?? throw new DomainException($"Pohyb {transactionId} neexistuje.");
        t.RecurringPaymentId = r.Id;
        t.IsRecurring = true;
        await db.SaveChangesAsync();
    }

    /// <summary>Po založení/potvrzení spáruje odpovídající pohyby za posledních 6 měsíců.</summary>
    public async Task<int> PairHistoryAsync(RecurringPayment r)
    {
        var from = time.Today().AddMonths(-6);
        var txs = await db.Transactions.Where(t => t.AccountId == r.AccountId && t.Date >= from && t.RecurringPaymentId == null).ToListAsync();
        var n = 0;
        foreach (var t in txs.Where(t => RecurringSchedule.FindMatch([r], t) is not null))
        {
            t.RecurringPaymentId = r.Id;
            t.IsRecurring = true;
            n++;
        }
        await db.SaveChangesAsync();
        return n;
    }

    /// <summary>
    /// Detekce návrhů: stejná protistrana na účtu aspoň ve 2 různých měsících za posledních 100 dní, podobná částka (±20 %)
    /// a pravidelný odstup (týdně / měsíčně). Návrh má stav Suggested.
    /// </summary>
    public async Task<int> DetectAsync()
    {
        var today = time.Today();
        var txs = await db.Transactions.AsNoTracking()
            .Where(t => t.Date >= today.AddDays(-100) && t.RecurringPaymentId == null
                        && (t.Kind == TransactionKind.Expense || t.Kind == TransactionKind.Income || t.Kind == TransactionKind.Transfer))
            .ToListAsync();
        var existing = await db.RecurringPayments.AsNoTracking().ToListAsync();
        var n = 0;
        // Příchozí strana převodu mezi vlastními účty se nenavrhuje (pravidelná je odchozí platba)
        foreach (var g in txs.Where(t => !(t.Kind == TransactionKind.Transfer && t.Amount > 0))
                     .GroupBy(t => (t.AccountId, Key: Text.MerchantKey(t.Counterparty), Sign: Math.Sign(t.Amount))).Where(g => g.Key.Key.Length >= 3))
        {
            var items = g.OrderBy(t => t.Date).ToList();
            var months = items.Select(t => (t.Date.Year, t.Date.Month)).Distinct().Count();
            if (months < 2) continue;
            var median = items.Select(t => Math.Abs(t.Amount)).OrderBy(x => x).ElementAt(items.Count / 2);
            var similar = items.Where(t => Math.Abs(Math.Abs(t.Amount) - median) <= median * 0.15m).ToList();
            if (similar.Count < 2) continue;
            var gaps = similar.Zip(similar.Skip(1), (a, b) => b.Date.DayNumber - a.Date.DayNumber).ToList();
            var avg = gaps.Average();
            // Měsíčně: nejvýš jedna platba za měsíc (nákupy v supermarketu několikrát měsíčně nejsou pravidelná platba)
            Frequency? freq = avg is >= 26 and <= 35 && gaps.All(x => x is >= 20 and <= 40) && items.Count <= months + 1 ? Frequency.Monthly
                : avg is >= 6 and <= 8 && gaps.All(x => x is >= 5 and <= 9) ? Frequency.Weekly : null;
            if (freq is null) continue;
            if (existing.Any(r => r.AccountId == g.Key.AccountId && Text.Normalize(r.MatchPattern).Contains(g.Key.Key))) continue;
            var last = similar[^1];
            var amounts = similar.Select(t => Math.Abs(t.Amount)).ToList();
            var variable = amounts.Max() - amounts.Min() > median * 0.02m;
            db.RecurringPayments.Add(new RecurringPayment
            {
                AccountId = g.Key.AccountId, Name = last.Counterparty.Length > 60 ? last.Counterparty[..60] : last.Counterparty,
                MatchPattern = g.Key.Key.ToUpperInvariant(), CategoryId = last.CategoryId, Amount = Math.Sign(last.Amount) * median,
                AmountKind = variable ? AmountKind.Variable : AmountKind.Fixed,
                VariancePct = variable ? (int)Math.Ceiling((amounts.Max() - amounts.Min()) / median * 100) : 10,
                Frequency = freq.Value, AnchorDate = last.Date, ToleranceDays = 3, IsTransfer = last.Kind == TransactionKind.Transfer,
                Status = RecurringStatus.Suggested, Source = RecurringSource.Detected, CreatedAt = time.GetUtcNow(),
                Note = $"{similar.Count} {(similar.Count is >= 2 and <= 4 ? "platby" : "plateb")}, naposledy {last.Date:d. M.}",
            });
            n++;
        }
        await db.SaveChangesAsync();
        return n;
    }

    /// <summary>Upozornění: chybějící platba po toleranci, fixní částka jiná než obvykle.</summary>
    public async Task<List<RecurringAlert>> AlertsAsync()
    {
        var today = time.Today();
        var occ = await OccurrencesAsync(today.AddDays(-45), today);
        var list = await db.RecurringPayments.AsNoTracking().Where(r => r.Status == RecurringStatus.Active).ToDictionaryAsync(r => r.Id);
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id, a => a.Name);
        var alerts = new List<RecurringAlert>();
        foreach (var o in occ.Where(o => o.State == OccurrenceState.Missing))
        {
            var r = list[o.RecurringId];
            alerts.Add(new RecurringAlert("missing", r.Id, $"Chybí platba: {r.Name}",
                $"Očekávána {o.Due:d. M.} z účtu {accounts.GetValueOrDefault(r.AccountId)}. Za tolerancí ±{r.ToleranceDays} dny žádná odpovídající platba.", o.Due, null));
        }
        var lastPaired = (await db.Transactions.AsNoTracking().Where(t => t.RecurringPaymentId != null && t.Date >= today.AddDays(-40))
                .Select(t => new { t.RecurringPaymentId, t.Date, t.Amount }).ToListAsync())
            .GroupBy(t => t.RecurringPaymentId!.Value).Select(g => g.OrderByDescending(x => x.Date).First());
        foreach (var t in lastPaired)
        {
            if (!list.TryGetValue(t.RecurringPaymentId!.Value, out var r) || r.AmountKind != AmountKind.Fixed) continue;
            if (r.AmountAlertDismissedFor is { } dismissed && t.Date <= dismissed) continue;
            var diff = Math.Abs(t.Amount) - Math.Abs(r.Amount);
            if (Math.Abs(diff) <= Math.Max(1, Math.Abs(r.Amount) * 0.02m)) continue;
            alerts.Add(new RecurringAlert("amount", r.Id, $"{r.Name}: částka {(diff > 0 ? "vyšší" : "nižší")} než obvykle",
                $"{t.Date:d. M.} strženo {Math.Abs(t.Amount):N0} místo {Math.Abs(r.Amount):N0}. Změna tarifu, nebo jednorázově?", t.Date, t.Amount));
        }
        return alerts;
    }
}

using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MimeKit;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Integrations;

namespace Pampeliska.Core.Services;

/// <summary>Fronta e-mailů ke zpracování (plní ji příjem, čte <see cref="InboundEmailWorker"/>).</summary>
public class InboundEmailQueue
{
    private readonly Channel<int> _channel = Channel.CreateUnbounded<int>();
    public void Enqueue(int id) => _channel.Writer.TryWrite(id);
    public IAsyncEnumerable<int> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}

public record InboundSenderRow(string Domain, string Name, bool Enabled, bool Known);

public record InboundAccountRow(int Id, string Name, string Institution, string? Iban, string Currency, IReadOnlyList<string> CardSuffixes,
    DateTimeOffset? LastNotificationAt);

/// <summary>
/// Zpracování přijatého e-mailu: ověření odesílatele (DKIM + povolené domény), vytažení pohybů modelem,
/// přiřazení k účtu a zápis přes <see cref="ImportService"/> jako předběžné pohyby (docs/email-notifikace.md kap. 3).
/// </summary>
public partial class InboundEmailProcessor(AppDbContext db, ImportService import, INotificationExtractor extractor, DkimChecker dkim,
    TimeProvider time, ILogger<InboundEmailProcessor> log)
{
    public const int MaxAttempts = 5;
    private const int MaxDaysBack = 45;

    public bool ExtractionAvailable => extractor.Available;

    // ---------- Povolení odesílatelé ----------

    public async Task<IReadOnlyList<InboundSenderRow>> SendersAsync()
    {
        var rows = await db.InboundSenders.AsNoTracking().ToListAsync();
        var list = KnownBanks.All.Select(b =>
        {
            var r = rows.FirstOrDefault(x => x.Domain == b.Domain);
            return new InboundSenderRow(b.Domain, b.Name, r?.Enabled ?? true, true);
        }).ToList();
        list.AddRange(rows.Where(r => KnownBanks.All.All(b => b.Domain != r.Domain))
            .OrderBy(r => r.Domain).Select(r => new InboundSenderRow(r.Domain, r.Name ?? r.Domain, r.Enabled, false)));
        return list;
    }

    public async Task SetSenderAsync(string domain, bool enabled, string? name = null)
    {
        var d = NormalizeDomain(domain) ?? throw new DomainException("Zadejte doménu odesílatele, např. moneta.cz.");
        var row = await db.InboundSenders.FirstOrDefaultAsync(x => x.Domain == d);
        if (row is null)
        {
            row = new InboundSender { Domain = d, Name = name?.Trim() is { Length: > 0 } n ? n : KnownBanks.Find(d)?.Name, CreatedAt = time.GetUtcNow() };
            db.InboundSenders.Add(row);
        }
        row.Enabled = enabled;
        await db.SaveChangesAsync();
    }

    public async Task RemoveSenderAsync(string domain)
    {
        var d = NormalizeDomain(domain);
        var row = await db.InboundSenders.FirstOrDefaultAsync(x => x.Domain == d);
        if (row is null) return;
        db.InboundSenders.Remove(row);
        await db.SaveChangesAsync();
    }

    // ---------- Karty u účtů ----------

    public async Task<IReadOnlyList<InboundAccountRow>> AccountsAsync()
    {
        var accounts = await db.Accounts.AsNoTracking().Include(a => a.Institution).Where(a => !a.Archived)
            .OrderBy(a => a.SortOrder).ThenBy(a => a.Id).ToListAsync();
        var last = await db.Transactions.AsNoTracking().Where(t => t.InboundEmailId != null)
            .GroupBy(t => t.AccountId).Select(g => new { g.Key, Last = g.Max(t => t.CreatedAt) }).ToListAsync();
        return accounts.Select(a => new InboundAccountRow(a.Id, a.Name, a.Institution?.Name ?? a.InstitutionKey, a.Iban, a.Currency, a.CardSuffixes,
            last.FirstOrDefault(l => l.Key == a.Id)?.Last)).ToList();
    }

    public async Task SetCardsAsync(int accountId, IEnumerable<string> suffixes)
    {
        var a = await db.Accounts.FirstOrDefaultAsync(x => x.Id == accountId) ?? throw new DomainException($"Účet {accountId} neexistuje.");
        var list = new List<string>();
        foreach (var s in suffixes)
        {
            var d = Digits(s ?? "");
            if (d.Length != 4) throw new DomainException($"„{s}“ nejsou 4 poslední číslice karty.");
            if (!list.Contains(d)) list.Add(d);
        }
        a.CardSuffixes = list;
        await db.SaveChangesAsync();
    }

    private static string? NormalizeDomain(string? domain)
    {
        if (string.IsNullOrWhiteSpace(domain)) return null;
        var d = domain.Trim().ToLowerInvariant().TrimStart('@');
        if (d.Contains('@')) d = d[(d.IndexOf('@') + 1)..];
        if (!DomainRegex().IsMatch(d)) throw new DomainException($"„{domain}“ není platná doména.");
        return d;
    }

    private async Task<string?> AllowedDomainAsync(IEnumerable<string> signedDomains)
    {
        var rows = await db.InboundSenders.AsNoTracking().ToListAsync();
        foreach (var signed in signedDomains)
        {
            var custom = rows.Where(r => KnownBanks.DomainMatches(signed, r.Domain)).OrderByDescending(r => r.Domain.Length).FirstOrDefault();
            if (custom is not null) { if (custom.Enabled) return signed; continue; }
            if (KnownBanks.Find(signed) is not null) return signed;
        }
        return null;
    }

    // ---------- Zpracování ----------

    /// <summary>
    /// Zpracuje e-mail. <paramref name="force"/> = zpracovat i od nepovoleného či neověřeného odesílatele (uživatel to potvrdil).
    /// Dočasná chyba modelu nechá e-mail ve stavu Přijato a zvýší počet pokusů.
    /// </summary>
    public async Task<InboundEmailState> ProcessAsync(int id, bool force = false, CancellationToken ct = default)
    {
        var e = await db.InboundEmails.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DomainException($"E-mail {id} neexistuje.");
        if (e.State is InboundEmailState.Imported or InboundEmailState.Statement)
            throw new DomainException("Pohyby z tohoto e-mailu už jsou zapsané.");
        if (!extractor.Available)
        {
            e.Note = "Vytahování pohybů není na serveru zapnuté (chybí klíč Claude API).";
            await db.SaveChangesAsync(ct);
            return e.State;
        }

        MimeMessage? msg = null;
        if (e.RawMime is { } raw)
        {
            try { msg = await MimeMessage.LoadAsync(new MemoryStream(raw, writable: false), ct); }
            catch (FormatException) { /* nečitelný e-mail – zůstane jen text */ }
        }

        // 1) Odesílatel
        if (msg is not null)
        {
            IReadOnlyList<string> signed;
            try { signed = await dkim.PassingDomainsAsync(msg, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning("Ověření DKIM e-mailu {Id} selhalo: {Error}", id, ex.Message);
                signed = [];
            }
            e.DkimDomain = await AllowedDomainAsync(signed) ?? signed.FirstOrDefault();
            if (!force && await AllowedDomainAsync(signed) is null)
                return await FinishAsync(e, InboundEmailState.Quarantined, signed.Count > 0
                    ? $"Odesílatel {signed[0]} není mezi povolenými. Když jde o vaši banku, povolte ho."
                    : "E-mail nemá platný podpis odesílatele (DKIM), nejde ověřit, že ho poslala banka.", ct);
        }
        else if (!force && (e.DkimDomain is null || await AllowedDomainAsync([e.DkimDomain]) is null))
        {
            return await FinishAsync(e, InboundEmailState.Quarantined, "Odesílatele nejde ověřit.", ct);
        }

        // 2) Vytažení pohybů
        var attachments = msg?.Attachments.Select(a => a is MimePart p ? p.FileName : null).OfType<string>().ToList() ?? [];
        if (string.IsNullOrWhiteSpace(e.TextBody) && attachments.Count == 0)
            return await FinishAsync(e, InboundEmailState.NotMovement, "E-mail nemá žádný text.", ct);

        ExtractedNotification result;
        try
        {
            e.Attempts++;
            var text = e.TextBody ?? "";
            result = await extractor.ExtractAsync(new ExtractionInput(
                e.FromName is { } n ? $"{n} <{e.FromAddress}>" : e.FromAddress, e.Subject, e.SentAt ?? e.ReceivedAt,
                text.Length > 30_000 ? text[..30_000] : text, attachments), ct);
        }
        catch (TransientExtractionException ex)
        {
            e.Error = ex.Message;
            await db.SaveChangesAsync(ct);
            log.LogWarning("Vytažení pohybů z e-mailu {Id} se nepovedlo (pokus {N}): {Error}", id, e.Attempts, ex.Message);
            if (e.Attempts >= MaxAttempts) return await FinishAsync(e, InboundEmailState.Failed, ex.Message, ct);
            return e.State;
        }
        catch (InvalidOperationException ex)
        {
            return await FinishAsync(e, InboundEmailState.Failed, ex.Message, ct);
        }
        e.ExtractedJson = JsonSerializer.Serialize(result, ClaudeNotificationExtractor.Json);
        e.Error = null;

        if (result.Kind == "statement")
            return await FinishAsync(e, InboundEmailState.NotMovement,
                "Výpis z účtu. Načítání výpisů z e-mailu připravujeme – zatím ho předejte Claudovi přes MCP.", ct);
        if (result.Kind != "movements" || result.Movements.Count == 0)
            return await FinishAsync(e, InboundEmailState.NotMovement, result.Reason ?? "E-mail neoznamuje pohyb na účtu.", ct);

        return await ImportAsync(e, result.Movements, null, ct);
    }

    /// <summary>Uživatel vybral účet u e-mailu ve stavu „Vyberte účet“ (volitelně si zapamatovat kartu).</summary>
    public async Task<InboundEmailState> AssignAccountAsync(int id, int accountId, bool rememberCard, CancellationToken ct = default)
    {
        var e = await db.InboundEmails.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DomainException($"E-mail {id} neexistuje.");
        if (e.State != InboundEmailState.NeedsAccount || e.ExtractedJson is null) throw new DomainException("U tohoto e-mailu se účet nevybírá.");
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId, ct) ?? throw new DomainException($"Účet {accountId} neexistuje.");
        var result = JsonSerializer.Deserialize<ExtractedNotification>(e.ExtractedJson, ClaudeNotificationExtractor.Json)!;
        if (rememberCard)
        {
            foreach (var card in result.Movements.Select(m => CardDigits(m.CardSuffix)).OfType<string>().Distinct())
                if (!account.CardSuffixes.Contains(card)) account.CardSuffixes = [.. account.CardSuffixes, card];
        }
        return await ImportAsync(e, result.Movements, account.Id, ct);
    }

    private async Task<InboundEmailState> ImportAsync(InboundEmail e, List<ExtractedMovement> movements, int? forcedAccountId, CancellationToken ct)
    {
        var accounts = await db.Accounts.AsNoTracking().Where(a => !a.Archived).ToListAsync(ct);
        var bankKey = KnownBanks.Find(e.DkimDomain)?.InstitutionKey;
        var sent = DateOnly.FromDateTime((e.SentAt ?? e.ReceivedAt).UtcDateTime);
        var today = time.Today();

        var items = new List<(int AccountId, ImportItem Item)>();
        foreach (var m in movements)
        {
            if (!DateOnly.TryParseExact(m.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                return await FinishAsync(e, InboundEmailState.Failed, $"Nečitelné datum pohybu „{m.Date}“.", ct);
            if (date > today.AddDays(1) || date < sent.AddDays(-MaxDaysBack))
                return await FinishAsync(e, InboundEmailState.Failed, $"Datum pohybu {date:d. M. yyyy} nesedí k datu e-mailu.", ct);
            if (m.Amount == 0)
                return await FinishAsync(e, InboundEmailState.Failed, "Pohyb má nulovou částku.", ct);

            var accountId = forcedAccountId ?? ResolveAccount(m, accounts, bankKey);
            if (accountId is null)
            {
                var hint = CardDigits(m.CardSuffix) is { } c ? $" (karta •• {c})" : m.AccountNumber is { } a ? $" (účet {a})" : "";
                return await FinishAsync(e, InboundEmailState.NeedsAccount, $"Nevím, ke kterému účtu pohyb patří{hint}. Vyberte účet.", ct);
            }
            var account = accounts.First(a => a.Id == accountId);
            if (!string.Equals(m.Currency, account.Currency, StringComparison.OrdinalIgnoreCase))
                return await FinishAsync(e, InboundEmailState.Failed,
                    $"Pohyb je v {m.Currency.ToUpperInvariant()}, účet {account.Name} v {account.Currency}. Zapíše ho až výpis.", ct);

            var message = string.Join(" · ", new[] { m.Message, m.VariableSymbol is { Length: > 0 } vs ? $"VS {vs}" : null }.Where(x => !string.IsNullOrWhiteSpace(x)));
            items.Add((account.Id, new ImportItem(
                date, m.Amount, Counterparty: m.Counterparty, Time: ParseTime(m.Time), Currency: account.Currency,
                CounterpartyAccount: m.CounterpartyAccount, Message: message.Length > 0 ? message : null,
                RawText: Clip(e.TextBody, 2000), PaymentType: Enum.TryParse<PaymentType>(m.PaymentType, out var pt) ? pt : PaymentType.Other)));
        }

        var batchNote = $"Notifikace {today:d. M.}";
        var batchId = await db.ImportBatches.Where(b => b.Source == BatchSource.Email && b.State == BatchState.Uploaded && b.Note == batchNote)
            .OrderByDescending(b => b.Id).Select(b => (int?)b.Id).FirstOrDefaultAsync(ct);
        var created = new List<int>();
        var skipped = 0;
        try
        {
            foreach (var g in items.GroupBy(x => x.AccountId))
            {
                var r = await import.ImportAsync(g.Key, g.Select(x => x.Item).ToList(),
                    new ImportOptions(BatchSource.Email, "E-mail z banky", Note: batchNote, BatchId: batchId));
                batchId = r.BatchId;
                created.AddRange(r.TransactionIds);
                skipped += r.SkippedDuplicates;
            }
        }
        catch (DomainException ex)
        {
            db.ChangeTracker.Clear();
            var fresh = await db.InboundEmails.FirstAsync(x => x.Id == e.Id, ct);
            fresh.ExtractedJson = e.ExtractedJson;
            fresh.DkimDomain = e.DkimDomain;
            fresh.Attempts = e.Attempts;
            return await FinishAsync(fresh, InboundEmailState.Failed, ex.Message, ct);
        }

        var txs = await db.Transactions.Where(t => created.Contains(t.Id)).ToListAsync(ct);
        foreach (var t in txs)
        {
            t.Provisional = true;
            t.InboundEmailId = e.Id;
        }
        var note = created.Count == 0 && skipped > 0 ? "Pohyb už v evidenci byl, nic nového se nezapsalo." : null;
        return await FinishAsync(e, InboundEmailState.Imported, note, ct);
    }

    private async Task<InboundEmailState> FinishAsync(InboundEmail e, InboundEmailState state, string? note, CancellationToken ct)
    {
        e.State = state;
        e.Note = note;
        e.ProcessedAt = time.GetUtcNow();
        await db.SaveChangesAsync(ct);
        log.LogInformation("E-mail {Id} zpracován: {State}{Note}", e.Id, state, note is null ? "" : $" – {note}");
        return state;
    }

    /// <summary>Účet podle čísla účtu (i maskovaného), čísla karty, nebo jediného účtu banky odesílatele.</summary>
    public static int? ResolveAccount(ExtractedMovement m, IReadOnlyList<Account> accounts, string? bankInstitutionKey)
    {
        if (m.AccountNumber is { Length: > 0 } hint)
        {
            var byNumber = accounts.Where(a => AccountMatches(a.Iban, hint)).ToList();
            if (byNumber.Count == 1) return byNumber[0].Id;
        }
        if (CardDigits(m.CardSuffix) is { } card)
        {
            var byCard = accounts.Where(a => a.CardSuffixes.Contains(card)).ToList();
            if (byCard.Count == 1) return byCard[0].Id;
        }
        if (bankInstitutionKey is not null)
        {
            var ofBank = accounts.Where(a => a.InstitutionKey == bankInstitutionKey && a.Kind == AccountKind.Current).ToList();
            if (ofBank.Count == 1) return ofBank[0].Id;
        }
        return null;
    }

    /// <summary>Číslo účtu z e-mailu proti účtu domácnosti: plný tvar, bez kódu banky, nebo maskovaný („****4567“).</summary>
    public static bool AccountMatches(string? accountIban, string hint)
    {
        if (string.IsNullOrWhiteSpace(accountIban)) return false;
        if (AccountNumber.Same(accountIban, hint)) return true;
        var canon = AccountNumber.Normalize(accountIban)!;
        var own = Digits(canon.Contains('/') ? canon[..canon.IndexOf('/')] : canon);
        var h = hint.Contains('/') ? hint[..hint.IndexOf('/')] : hint;
        if (hint.Contains('/') && AccountNumber.BankCode(accountIban) is { } bank && !hint.EndsWith("/" + bank)) return false;
        var masked = h.IndexOfAny(['*', 'x', 'X', '•', '.']) >= 0;
        var visible = Digits(masked ? h[(h.LastIndexOfAny(['*', 'x', 'X', '•', '.']) + 1)..] : h).TrimStart('0');
        if (masked) return visible.Length >= 3 && own.EndsWith(visible);
        return visible.Length >= 6 && (own.TrimStart('0') == visible || own.EndsWith(visible));
    }

    private static string Digits(string s) => new(s.Where(char.IsDigit).ToArray());

    private static string? CardDigits(string? s) => s is null ? null : Digits(s) is { Length: >= 4 } d ? d[^4..] : null;

    private static TimeOnly? ParseTime(string? s) =>
        TimeOnly.TryParseExact(s, ["HH:mm", "H:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var t) ? t : null;

    private static string? Clip(string? s, int max) => s is null ? null : s.Length > max ? s[..max] : s;

    [GeneratedRegex(@"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")]
    private static partial Regex DomainRegex();
}

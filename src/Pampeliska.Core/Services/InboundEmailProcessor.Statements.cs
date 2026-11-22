using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MimeKit;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Integrations;

namespace Pampeliska.Core.Services;

/// <summary>Účet z výpisu v příloze (<see cref="InboundEmail.StatementJson"/>).</summary>
public record StatementPart(string FileName, string? PasswordLabel, StatementAccount Account);

/// <summary>Výsledek načtení jednoho účtu z výpisu (<see cref="InboundEmail.StatementResultJson"/>).</summary>
/// <param name="BalanceInApp">Zůstatek účtu v aplikaci ke konci období po importu (pro porovnání s konečným zůstatkem výpisu).</param>
public record StatementAccountOutcome(string FileName, int? AccountId, string? AccountName, string? AccountNumber, string Currency,
    DateOnly? PeriodFrom, DateOnly? PeriodTo, decimal? OpeningBalance, decimal? ClosingBalance, int Movements, int? BatchId,
    int Created, int Reconciled, int NotInStatement, int Skipped, int Suspected, decimal? BalanceInApp, string? PasswordLabel);

/// <summary>Příloha e-mailu převedená na text (PDF odemčené uloženým heslem, CSV…).</summary>
public record AttachmentText(int Index, string FileName, string Kind, string? Text, string? PasswordLabel, string? Problem);

/// <summary>Výpisy z účtu v příloze e-mailu (docs/email-notifikace.md, „Výpisy e-mailem“).</summary>
public partial class InboundEmailProcessor
{
    public const int MaxStatementChars = 400_000;
    private const decimal SumTolerance = 0.01m;

    private static readonly string[] TextExtensions = [".csv", ".txt", ".xml", ".gpc", ".abo", ".sta", ".ofx", ".tsv"];

    private sealed record StatementFile(int Index, string Name, byte[] Data, bool Pdf);

    /// <summary>Přílohy, které můžou být výpisem (PDF a textové formáty bank), s indexem v seznamu příloh e-mailu.</summary>
    private static List<StatementFile> StatementFiles(MimeMessage msg)
    {
        var list = new List<StatementFile>();
        var i = 0;
        foreach (var a in msg.Attachments)
        {
            var index = i++;
            if (a is not MimePart part) continue;
            var name = part.FileName ?? part.ContentType.Name ?? $"příloha {index + 1}";
            var ext = Path.GetExtension(name).ToLowerInvariant();
            var mime = part.ContentType.MimeType.ToLowerInvariant();
            var pdf = ext == ".pdf" || mime == "application/pdf";
            if (!pdf && !TextExtensions.Contains(ext) && mime is not ("text/csv" or "text/plain" or "application/xml" or "text/xml")) continue;
            using var ms = new MemoryStream();
            part.Content?.DecodeTo(ms);
            list.Add(new StatementFile(index, name, ms.ToArray(), pdf));
        }
        return list;
    }

    /// <summary>CSV z českých bank bývá ve Windows-1250 – když text není platné UTF-8, čte se tak.</summary>
    public static string DecodeText(byte[] data)
    {
        try { return new UTF8Encoding(false, true).GetString(data).TrimStart('﻿'); }
        catch (DecoderFallbackException)
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            return Encoding.GetEncoding(1250).GetString(data);
        }
    }

    /// <summary>Text přílohy pro Clauda přes MCP (PDF se odemkne uloženými hesly).</summary>
    public async Task<AttachmentText> AttachmentTextAsync(int emailId, int index, CancellationToken ct = default)
    {
        var e = await db.InboundEmails.AsNoTracking().FirstOrDefaultAsync(x => x.Id == emailId, ct) ?? throw new DomainException($"E-mail {emailId} neexistuje.");
        if (e.RawMime is null) throw new DomainException("Původní e-mail i s přílohami už je smazaný.");
        var msg = await MimeMessage.LoadAsync(new MemoryStream(e.RawMime, writable: false), ct);
        var file = StatementFiles(msg).FirstOrDefault(f => f.Index == index)
                   ?? throw new DomainException($"Příloha {index} neexistuje nebo to není PDF ani textový soubor.");
        var (text, label, problem) = await ReadFileAsync(file, e.DkimDomain, ct);
        if (text is { Length: > MaxStatementChars }) (text, problem) = (text[..MaxStatementChars], $"Text je zkrácený na {MaxStatementChars} znaků.");
        return new AttachmentText(index, file.Name, file.Pdf ? "pdf" : "text", text, label, problem);
    }

    /// <summary>Text souboru; u PDF zkusí uložená hesla. Problem = proč text není.</summary>
    private async Task<(string? Text, string? PasswordLabel, string? Problem)> ReadFileAsync(StatementFile file, string? senderDomain, CancellationToken ct)
    {
        if (!file.Pdf) return (DecodeText(file.Data), null, null);
        var candidates = await passwords.CandidatesAsync(senderDomain);
        var r = PdfText.Read(file.Data, candidates);
        switch (r.Status)
        {
            case PdfReadStatus.Locked:
                return (null, null, candidates.Count == 0
                    ? $"Příloha {file.Name} je zamčená heslem. Uložte heslo k výpisům v Nastavení příjmu a e-mail zpracujte znovu."
                    : $"Příloha {file.Name} je zamčená heslem a žádné z uložených hesel nesedí. Přidejte heslo v Nastavení příjmu a e-mail zpracujte znovu.");
            case PdfReadStatus.NoText:
                return (null, null, $"Příloha {file.Name} neobsahuje text (nejspíš je naskenovaná).");
            case PdfReadStatus.Invalid:
                return (null, null, $"Příloha {file.Name} není čitelné PDF.");
        }
        string? label = null;
        if (r.PasswordId is { } pid)
        {
            await passwords.MarkUsedAsync(pid, senderDomain);
            label = (await db.StatementPasswords.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pid, ct))?.Label;
        }
        return (r.Text, label, null);
    }

    /// <summary>E-mail s výpisem: přečte přílohy, vytáhne účty a pohyby a zapíše je jako výpis.</summary>
    private async Task<InboundEmailState> ProcessStatementAsync(InboundEmail e, MimeMessage? msg, CancellationToken ct)
    {
        if (msg is null)
            return await FinishAsync(e, InboundEmailState.NotMovement, "Výpis z účtu, ale původní e-mail s přílohou už je smazaný.", ct);
        var files = StatementFiles(msg);
        if (files.Count == 0)
            return await FinishAsync(e, InboundEmailState.NotMovement,
                "Výpis z účtu bez přílohy – banka ho posílá jen odkazem. Stáhněte ho z bankovnictví a předejte Claudovi přes MCP.", ct);

        var parts = new List<StatementPart>();
        string? reason = null;
        foreach (var file in files)
        {
            var (text, label, problem) = await ReadFileAsync(file, e.DkimDomain, ct);
            if (text is null)
                return await FinishAsync(e, problem!.Contains("heslem") ? InboundEmailState.NeedsPassword : InboundEmailState.Failed, problem, ct);
            if (string.IsNullOrWhiteSpace(text)) continue;
            if (text.Length > MaxStatementChars)
                return await FinishAsync(e, InboundEmailState.Failed, $"Příloha {file.Name} je na přečtení moc dlouhá. Předejte ji Claudovi přes MCP.", ct);

            ExtractedStatement st;
            try
            {
                e.Attempts++;
                st = await extractor.ExtractStatementAsync(new StatementInput(
                    e.FromName is { } n ? $"{n} <{e.FromAddress}>" : e.FromAddress, e.Subject, file.Name, text), ct);
            }
            catch (TransientExtractionException ex)
            {
                return await TransientAsync(e, ex, ct);
            }
            catch (InvalidOperationException ex)
            {
                return await FinishAsync(e, InboundEmailState.Failed, $"{file.Name}: {ex.Message}", ct);
            }
            reason ??= st.Reason;
            parts.AddRange(st.Accounts.Select(a => new StatementPart(file.Name, label, a)));
        }
        if (parts.Count == 0)
            return await FinishAsync(e, InboundEmailState.NotMovement, reason ?? "V příloze není výpis z účtu.", ct);

        e.StatementJson = JsonSerializer.Serialize(parts, ClaudeNotificationExtractor.Json);
        e.Error = null;
        return await ImportStatementAsync(e, parts, null, ct);
    }

    private async Task<InboundEmailState> TransientAsync(InboundEmail e, TransientExtractionException ex, CancellationToken ct)
    {
        e.Error = ex.Message;
        await db.SaveChangesAsync(ct);
        log.LogWarning("Čtení e-mailu {Id} se nepovedlo (pokus {N}): {Error}", e.Id, e.Attempts, ex.Message);
        if (e.Attempts >= MaxAttempts) return await FinishAsync(e, InboundEmailState.Failed, ex.Message, ct);
        return e.State;
    }

    private sealed record PlannedPart(StatementPart Part, Account? Account, List<ImportItem> Items, DateOnly From, DateOnly To);

    /// <summary>
    /// Zapíše účty z výpisu. Nejdřív zkontroluje všechny části (data, součet pohybů proti zůstatkům, účet, měnu),
    /// zapisuje se až když projdou. <paramref name="forcedAccountId"/> = účet vybraný uživatelem pro část, kterou nejde přiřadit.
    /// </summary>
    private async Task<InboundEmailState> ImportStatementAsync(InboundEmail e, List<StatementPart> parts, int? forcedAccountId, CancellationToken ct)
    {
        var accounts = await db.Accounts.AsNoTracking().Where(a => !a.Archived).ToListAsync(ct);
        var bankKey = KnownBanks.Find(e.DkimDomain)?.InstitutionKey;
        var today = time.Today();

        var plan = new List<PlannedPart>();
        var unresolved = 0;
        foreach (var part in parts)
        {
            var a = part.Account;
            var label = a.AccountNumber is { Length: > 0 } num ? $"účtu {num}" : "účtu";
            var items = new List<ImportItem>();
            foreach (var m in a.Movements)
            {
                if (!TryDate(m.Date, out var date))
                    return await FinishAsync(e, InboundEmailState.Failed, $"Nečitelné datum pohybu „{m.Date}“ ve výpisu {label}.", ct);
                if (date > today.AddDays(1))
                    return await FinishAsync(e, InboundEmailState.Failed, $"Pohyb ve výpisu {label} má datum v budoucnu ({date:d. M. yyyy}).", ct);
                if (m.Amount == 0) continue;
                var message = string.Join(" · ", new[] { m.Message, m.VariableSymbol is { Length: > 0 } vs ? $"VS {vs}" : null }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));
                items.Add(new ImportItem(date, m.Amount, Counterparty: m.Counterparty, Time: ParseTime(m.Time), CounterpartyAccount: m.CounterpartyAccount,
                    Message: message.Length > 0 ? message : null, PaymentType: Enum.TryParse<PaymentType>(m.PaymentType, out var pt) ? pt : PaymentType.Other,
                    ExternalId: Clip(m.ExternalId, 200)));
            }

            DateOnly? from = TryDate(a.PeriodFrom, out var pf) ? pf : null, to = TryDate(a.PeriodTo, out var pto) ? pto : null;
            from ??= items.Count > 0 ? items.Min(i => i.Date) : null;
            to ??= items.Count > 0 ? items.Max(i => i.Date) : null;
            if (from is null || to is null)
                return await FinishAsync(e, InboundEmailState.Failed, $"Ve výpisu {label} chybí období i pohyby.", ct);
            if (from > to || to > today.AddDays(1))
                return await FinishAsync(e, InboundEmailState.Failed, $"Období výpisu {label} ({from:d. M. yyyy} – {to:d. M. yyyy}) nedává smysl.", ct);
            if (items.Any(i => i.Date < from.Value.AddDays(-3) || i.Date > to.Value.AddDays(3)))
                return await FinishAsync(e, InboundEmailState.Failed, $"Některé pohyby ve výpisu {label} jsou mimo jeho období.", ct);

            // Kontrola úplnosti: počáteční zůstatek + pohyby = konečný zůstatek
            if (a.OpeningBalance is { } open && a.ClosingBalance is { } close)
            {
                var diff = open + items.Sum(i => i.Amount) - close;
                if (Math.Abs(diff) >= SumTolerance)
                    return await FinishAsync(e, InboundEmailState.Failed,
                        $"Součet pohybů ve výpisu {label} nesedí se zůstatky výpisu (rozdíl {diff.ToString("0.00", CultureInfo.GetCultureInfo("cs-CZ"))} {a.Currency}). " +
                        "Nic se nezapsalo – zkuste e-mail zpracovat znovu, případně výpis předejte Claudovi přes MCP.", ct);
            }

            var accountId = ResolveStatementAccount(a, accounts, bankKey);
            if (accountId is null)
            {
                unresolved++;
                accountId = forcedAccountId;
            }
            var account = accounts.FirstOrDefault(x => x.Id == accountId);
            if (account is not null && !string.Equals(a.Currency, account.Currency, StringComparison.OrdinalIgnoreCase))
                return await FinishAsync(e, InboundEmailState.Failed,
                    $"Výpis {label} je v {a.Currency.ToUpperInvariant()}, účet {account.Name} v {account.Currency}.", ct);
            plan.Add(new PlannedPart(part, account, items, from.Value, to.Value));
        }

        if (forcedAccountId is not null && unresolved > 1)
            throw new DomainException("Výpis obsahuje víc účtů, které nejde přiřadit automaticky. Doplňte u účtů čísla účtů a zpracujte e-mail znovu.");
        if (plan.FirstOrDefault(p => p.Account is null) is { } missing)
        {
            var num = missing.Part.Account.AccountNumber is { Length: > 0 } n ? $" {n}" : "";
            return await FinishAsync(e, InboundEmailState.NeedsAccount, $"Nevím, ke kterému účtu výpis{num} patří. Vyberte účet.", ct);
        }

        var outcomes = new List<StatementAccountOutcome>();
        try
        {
            foreach (var p in plan)
            {
                var a = p.Part.Account;
                ImportResult? r = null;
                if (p.Items.Count > 0)
                    r = await import.ImportAsync(p.Account!.Id, p.Items, new ImportOptions(BatchSource.EmailStatement, "E-mail z banky",
                        Note: $"Výpis {p.From:d. M.} – {p.To:d. M. yyyy}", PeriodFrom: p.From, PeriodTo: p.To));
                var balance = await BalanceService.BalanceAtAsync(db, p.Account!, p.To);
                outcomes.Add(new StatementAccountOutcome(p.Part.FileName, p.Account!.Id, p.Account.Name, a.AccountNumber, p.Account.Currency, p.From, p.To,
                    a.OpeningBalance, a.ClosingBalance, p.Items.Count, r?.BatchId, r?.Created ?? 0, r?.Reconciled ?? 0, r?.NotInStatement ?? 0,
                    r?.SkippedDuplicates ?? 0, r?.SuspectedDuplicates ?? 0, balance, p.Part.PasswordLabel));
            }
        }
        catch (DomainException ex)
        {
            db.ChangeTracker.Clear();
            var fresh = await db.InboundEmails.FirstAsync(x => x.Id == e.Id, ct);
            (fresh.StatementJson, fresh.DkimDomain, fresh.Attempts, fresh.ExtractedJson) = (e.StatementJson, e.DkimDomain, e.Attempts, e.ExtractedJson);
            if (outcomes.Count > 0) fresh.StatementResultJson = JsonSerializer.Serialize(outcomes, ClaudeNotificationExtractor.Json);
            return await FinishAsync(fresh, InboundEmailState.Failed, ex.Message, ct);
        }

        e.StatementResultJson = JsonSerializer.Serialize(outcomes, ClaudeNotificationExtractor.Json);
        return await FinishAsync(e, InboundEmailState.Statement, StatementNote(outcomes), ct);
    }

    /// <summary>Shrnutí pro uživatele: kolik pohybů, kolik spárováno, co chybí a jestli sedí zůstatek.</summary>
    public static string StatementNote(IReadOnlyList<StatementAccountOutcome> outcomes)
    {
        var cs = CultureInfo.GetCultureInfo("cs-CZ");
        var parts = new List<string>();
        foreach (var o in outcomes)
        {
            var s = new StringBuilder($"{o.AccountName}: {o.PeriodFrom:d. M.} – {o.PeriodTo:d. M. yyyy}, {o.Movements} {Plural(o.Movements, "pohyb", "pohyby", "pohybů")}");
            var details = new List<string>();
            if (o.Reconciled > 0) details.Add($"{o.Reconciled} spárováno s notifikacemi");
            if (o.Created > 0 && o.Reconciled > 0) details.Add($"{o.Created} nově");
            if (o.Skipped > 0) details.Add($"{o.Skipped} už v evidenci");
            if (o.NotInStatement > 0) details.Add($"{o.NotInStatement} z notifikací ve výpisu chybí");
            if (details.Count > 0) s.Append(" (").Append(string.Join(", ", details)).Append(')');
            s.Append('.');
            if (o.ClosingBalance is { } close && o.BalanceInApp is { } app && Math.Abs(close - app) >= SumTolerance)
                s.Append($" Zůstatek v Pampelišce k {o.PeriodTo:d. M.} je {app.ToString("N2", cs)} {o.Currency}, výpis uvádí {close.ToString("N2", cs)} {o.Currency}" +
                         $" – rozdíl {(app - close).ToString("N2", cs)} {o.Currency}.");
            parts.Add(s.ToString());
        }
        return string.Join(" ", parts);
    }

    /// <summary>Účet z výpisu podle čísla účtu, karet u plateb, nebo jediného účtu banky odesílatele (jakéhokoli druhu kromě investičního).</summary>
    public static int? ResolveStatementAccount(StatementAccount a, IReadOnlyList<Account> accounts, string? bankInstitutionKey)
    {
        if (a.AccountNumber is { Length: > 0 } hint)
        {
            var byNumber = accounts.Where(x => AccountMatches(x.Iban, hint)).ToList();
            if (byNumber.Count == 1) return byNumber[0].Id;
        }
        var cards = a.Movements.Select(m => CardDigits(m.CardSuffix)).OfType<string>().Distinct().ToList();
        if (cards.Count > 0)
        {
            var byCard = accounts.Where(x => cards.Any(c => x.CardSuffixes.Contains(c))).ToList();
            if (byCard.Count == 1) return byCard[0].Id;
        }
        if (bankInstitutionKey is not null && a.AccountNumber is null)
        {
            var ofBank = accounts.Where(x => x.InstitutionKey == bankInstitutionKey && x.Kind != AccountKind.Investment).ToList();
            if (ofBank.Count == 1) return ofBank[0].Id;
        }
        return null;
    }

    private static bool TryDate(string? s, out DateOnly date) =>
        DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    private static string Plural(int n, string one, string few, string many) => n == 1 ? one : n is >= 2 and <= 4 ? few : many;
}

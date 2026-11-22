namespace Pampeliska.Core.Domain;

/// <summary>
/// Stav přijatého e-mailu (docs/email-notifikace.md). <see cref="Statement"/> = výpis z přílohy načten,
/// <see cref="NeedsPassword"/> = PDF výpisu je zamčené a žádné uložené heslo nesedí.
/// </summary>
public enum InboundEmailState { Received, Imported, Statement, NotMovement, Quarantined, NeedsAccount, Failed, NeedsPassword }

public enum InboundEmailSource { Smtp, Upload }

/// <summary>E-mail přijatý na adresu domácnosti (notifikace banky nebo výpis). Surový MIME se po čase maže.</summary>
public class InboundEmail
{
    public int Id { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public InboundEmailSource Source { get; set; }
    public string? RemoteIp { get; set; }
    /// <summary>Odesílatel z obálky SMTP (MAIL FROM).</summary>
    public string? EnvelopeFrom { get; set; }
    /// <summary>Adresát z obálky SMTP (RCPT TO).</summary>
    public string? EnvelopeTo { get; set; }
    public string? FromName { get; set; }
    public string? FromAddress { get; set; }
    public string? Subject { get; set; }
    public string? MessageId { get; set; }
    /// <summary>Datum z hlavičky Date (kdy e-mail odeslal server banky).</summary>
    public DateTimeOffset? SentAt { get; set; }
    /// <summary>Čitelný text e-mailu (text/plain, případně převedené HTML).</summary>
    public string? TextBody { get; set; }
    /// <summary>Začátek textu pro seznam (bez zalomení).</summary>
    public string? Preview { get; set; }
    public int SizeBytes { get; set; }
    public int AttachmentCount { get; set; }
    /// <summary>Surový e-mail (RFC 5322). Po <c>Email:RetentionDays</c> dnech se smaže, zůstanou metadata a text.</summary>
    public byte[]? RawMime { get; set; }
    public DateTimeOffset? RawPurgedAt { get; set; }
    public InboundEmailState State { get; set; }
    public string? Error { get; set; }
    /// <summary>Doména z platného podpisu DKIM (kdo e-mail opravdu poslal), null = bez platného podpisu.</summary>
    public string? DkimDomain { get; set; }
    /// <summary>Pohyby vytažené z e-mailu (JSON <c>ExtractedNotification</c>).</summary>
    public string? ExtractedJson { get; set; }
    /// <summary>Vysvětlení stavu pro uživatele (proč karanténa, proč nejde o pohyb…).</summary>
    public string? Note { get; set; }
    /// <summary>Výpis vytažený z přílohy (JSON <c>ExtractedStatement</c>).</summary>
    public string? StatementJson { get; set; }
    /// <summary>Výsledek načtení výpisu po účtech (JSON <c>StatementOutcome</c>).</summary>
    public string? StatementResultJson { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }
    public int Attempts { get; set; }
}

/// <summary>
/// Povolený odesílatel (doména z podpisu DKIM). Známé banky (<see cref="Services.KnownBanks"/>) jsou povolené bez záznamu,
/// záznam s <see cref="Enabled"/> = false je vypne.
/// </summary>
public class InboundSender
{
    public int Id { get; set; }
    public required string Domain { get; set; }
    public string? Name { get; set; }
    public bool Enabled { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// Heslo k zamčeným PDF výpisům (poslední čísla rodného čísla, telefon, klientské číslo…). Hodnota je zašifrovaná
/// přes Data Protection, v aplikaci se po uložení nikdy neukáže a nejde do AI ani do logů.
/// </summary>
public class StatementPassword
{
    public int Id { get; set; }
    /// <summary>Popisek pro uživatele, např. „RČ – poslední 4 číslice“.</summary>
    public required string Label { get; set; }
    public required string ProtectedValue { get; set; }
    /// <summary>Banka (doména odesílatele), u které se heslo zkouší jako první. Null = u všech.</summary>
    public string? SenderDomain { get; set; }
    /// <summary>Kde heslo naposledy otevřelo výpis – příště se tam zkusí hned.</summary>
    public string? LastUsedDomain { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

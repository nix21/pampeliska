using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Text;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>Konfigurace příjmu e-mailů (sekce <c>Email</c>).</summary>
public class InboundEmailOptions
{
    /// <summary>Spustit SMTP server pro příjem.</summary>
    public bool Enabled { get; set; }
    /// <summary>Port uvnitř kontejneru (na VPS mapovaný z 25).</summary>
    public int Port { get; set; } = 2525;
    /// <summary>Doména, na kterou míří MX záznam.</summary>
    public string Domain { get; set; } = "pampeliska.nadrasky.cz";
    public string LocalPrefix { get; set; } = "banky";
    public int MaxSizeBytes { get; set; } = 10 * 1024 * 1024;
    /// <summary>Po kolika dnech se smaže surový e-mail.</summary>
    public int RetentionDays { get; set; } = 30;
    /// <summary>Certifikát pro STARTTLS (PEM). Bez něj server přijímá jen nešifrovaně.</summary>
    public string? CertificatePath { get; set; }
    public string? CertificateKeyPath { get; set; }
}

public record InboundEmailRow(int Id, DateTimeOffset ReceivedAt, InboundEmailSource Source, string? FromName, string? FromAddress, string? Subject,
    InboundEmailState State, int SizeBytes, int AttachmentCount, string? Preview);

public record InboundAttachment(string Name, string ContentType, long SizeBytes);

public record InboundEmailDetail(InboundEmailRow Email, string? EnvelopeFrom, string? EnvelopeTo, string? RemoteIp, DateTimeOffset? SentAt,
    string? MessageId, string? TextBody, string? Error, bool HasRaw, DateTimeOffset? RawPurgedAt, IReadOnlyList<InboundAttachment> Attachments);

public record InboundAddress(string Address, bool ReceivingEnabled, DateTimeOffset? LastReceivedAt, int Last30Days, int RetentionDays);

public record InboundStoreResult(int Id, bool Duplicate);

/// <summary>
/// Příjem e-mailů z bank: adresa domácnosti, uložení přijatého e-mailu (SMTP i nahraný .eml), seznam a mazání surových dat.
/// Vytěžení pohybů přijde v další fázi (docs/email-notifikace.md).
/// </summary>
public partial class InboundEmailService(AppDbContext db, IOptions<InboundEmailOptions> options, TimeProvider time) : IDailyCheck
{
    private const string TokenChars = "abcdefghijkmnpqrstuvwxyz23456789";
    private const int TextLimit = 200_000;
    private static readonly InboundEmailState[] NeedsAttention = [InboundEmailState.Quarantined, InboundEmailState.NeedsAccount, InboundEmailState.Failed];

    private InboundEmailOptions Opt => options.Value;

    public static string NewToken() => RandomNumberGenerator.GetString(TokenChars, 10);

    public string FormatAddress(string token) => $"{Opt.LocalPrefix}-{token}@{Opt.Domain}".ToLowerInvariant();

    public async Task<InboundAddress> AddressAsync()
    {
        var token = await EnsureTokenAsync();
        var since = time.GetUtcNow().AddDays(-30);
        var last = await db.InboundEmails.AsNoTracking().OrderByDescending(m => m.ReceivedAt).Select(m => (DateTimeOffset?)m.ReceivedAt).FirstOrDefaultAsync();
        var recent = await db.InboundEmails.CountAsync(m => m.ReceivedAt >= since);
        return new InboundAddress(FormatAddress(token), Opt.Enabled, last, recent, Opt.RetentionDays);
    }

    /// <summary>Nová adresa – stará přestane přijímat.</summary>
    public async Task<InboundAddress> RegenerateAsync()
    {
        var h = await db.Households.FirstAsync();
        h.InboundEmailToken = NewToken();
        await db.SaveChangesAsync();
        return await AddressAsync();
    }

    private async Task<string> EnsureTokenAsync()
    {
        var h = await db.Households.FirstAsync();
        if (h.InboundEmailToken is { Length: > 0 } t) return t;
        h.InboundEmailToken = NewToken();
        await db.SaveChangesAsync();
        return h.InboundEmailToken;
    }

    /// <summary>Patří adresa (RCPT TO) domácnosti? Ostatní adresáty SMTP server odmítne.</summary>
    public async Task<bool> IsKnownRecipientAsync(string address)
    {
        var token = await db.Households.AsNoTracking().Select(h => h.InboundEmailToken).FirstOrDefaultAsync();
        return token is { Length: > 0 } && string.Equals(address.Trim(), FormatAddress(token), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Uloží přijatý e-mail. Stejné Message-ID se uloží jen jednou (opakované doručení). Nečitelný e-mail ze SMTP se uloží
    /// jako chybný (surová data zůstanou), nahraný soubor skončí chybou pro uživatele.
    /// </summary>
    public async Task<InboundStoreResult> StoreAsync(byte[] raw, InboundEmailSource source, string? envelopeFrom = null, string? envelopeTo = null,
        string? remoteIp = null, CancellationToken ct = default)
    {
        if (raw.Length == 0) throw new DomainException("E-mail je prázdný.");
        if (raw.Length > Opt.MaxSizeBytes) throw new DomainException($"E-mail je větší než {Opt.MaxSizeBytes / 1024 / 1024} MB.");

        var email = new InboundEmail
        {
            ReceivedAt = time.GetUtcNow(), Source = source, RemoteIp = remoteIp, EnvelopeFrom = Clip(envelopeFrom, 320), EnvelopeTo = Clip(envelopeTo, 320),
            SizeBytes = raw.Length, RawMime = raw, State = InboundEmailState.Received,
        };
        MimeMessage? msg = null;
        try
        {
            using var stream = new MemoryStream(raw, writable: false);
            msg = await MimeMessage.LoadAsync(stream, ct);
            // MimeKit je benevolentní – soubor bez hlaviček Od/Předmět/Datum e-mailem není
            if (msg.From.Count == 0 && msg.Subject is null && msg.Date == DateTimeOffset.MinValue)
                throw new FormatException("chybí hlavičky From, Subject i Date");
        }
        catch (FormatException e)
        {
            if (source == InboundEmailSource.Upload) throw new DomainException("Soubor není e-mail ve formátu .eml.");
            email.State = InboundEmailState.Failed;
            email.Error = $"E-mail nejde přečíst: {e.Message}";
        }

        if (msg is not null)
        {
            var id = Clip(msg.MessageId, 998);
            if (id is not null)
            {
                var existing = await db.InboundEmails.AsNoTracking().Where(m => m.MessageId == id).Select(m => (int?)m.Id).FirstOrDefaultAsync(ct);
                if (existing is { } ex) return new InboundStoreResult(ex, true);
            }
            var from = msg.From.Mailboxes.FirstOrDefault();
            email.MessageId = id;
            email.FromName = Clip(from?.Name is { Length: > 0 } n ? n : null, 200);
            email.FromAddress = Clip(from?.Address?.ToLowerInvariant(), 320);
            email.Subject = Clip(msg.Subject, 500);
            email.SentAt = msg.Date == DateTimeOffset.MinValue ? null : msg.Date.ToUniversalTime();
            email.TextBody = ExtractText(msg);
            email.Preview = PreviewOf(email.TextBody);
            email.AttachmentCount = msg.Attachments.Count();
        }

        db.InboundEmails.Add(email);
        await db.SaveChangesAsync(ct);
        return new InboundStoreResult(email.Id, false);
    }

    public async Task<IReadOnlyList<InboundEmailRow>> ListAsync() =>
        await db.InboundEmails.AsNoTracking().OrderByDescending(m => m.ReceivedAt).ThenByDescending(m => m.Id).Take(500)
            .Select(m => new InboundEmailRow(m.Id, m.ReceivedAt, m.Source, m.FromName, m.FromAddress, m.Subject, m.State, m.SizeBytes, m.AttachmentCount, m.Preview))
            .ToListAsync();

    public async Task<InboundEmailDetail> DetailAsync(int id)
    {
        var m = await db.InboundEmails.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"E-mail {id} neexistuje.");
        var attachments = m.RawMime is { } raw ? Attachments(raw) : [];
        return new InboundEmailDetail(
            new InboundEmailRow(m.Id, m.ReceivedAt, m.Source, m.FromName, m.FromAddress, m.Subject, m.State, m.SizeBytes, m.AttachmentCount, m.Preview),
            m.EnvelopeFrom, m.EnvelopeTo, m.RemoteIp, m.SentAt, m.MessageId, m.TextBody, m.Error, m.RawMime is not null, m.RawPurgedAt, attachments);
    }

    /// <summary>Surový e-mail ke stažení (.eml).</summary>
    public async Task<(byte[] Raw, string FileName)> RawAsync(int id)
    {
        var m = await db.InboundEmails.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"E-mail {id} neexistuje.");
        if (m.RawMime is null) throw new DomainException($"Původní e-mail už je smazaný (uchovává se {Opt.RetentionDays} dní).");
        return (m.RawMime, $"email-{m.ReceivedAt:yyyyMMdd-HHmm}-{m.Id}.eml");
    }

    public async Task DeleteAsync(int id)
    {
        var m = await db.InboundEmails.FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"E-mail {id} neexistuje.");
        db.InboundEmails.Remove(m);
        await db.SaveChangesAsync();
    }

    /// <summary>E-maily, které čekají na uživatele (odznak v navigaci).</summary>
    public Task<int> NeedsAttentionCountAsync() => db.InboundEmails.CountAsync(m => NeedsAttention.Contains(m.State));

    /// <summary>Denní úklid: smaže surové e-maily starší než <see cref="InboundEmailOptions.RetentionDays"/>.</summary>
    public async Task RunAsync(CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var cutoff = now.AddDays(-Opt.RetentionDays);
        var old = await db.InboundEmails.Where(m => m.RawPurgedAt == null && m.ReceivedAt < cutoff).ToListAsync(ct);
        foreach (var m in old)
        {
            m.RawMime = null;
            m.RawPurgedAt = now;
        }
        if (old.Count > 0) await db.SaveChangesAsync(ct);
    }

    public static string? ExtractText(MimeMessage msg)
    {
        var text = msg.TextBody;
        if (string.IsNullOrWhiteSpace(text) && msg.HtmlBody is { Length: > 0 } html)
            text = new HtmlToText().Convert(html);
        if (string.IsNullOrWhiteSpace(text)) return null;
        text = ManyBlankLines().Replace(text.Replace("\r\n", "\n").Trim(), "\n\n");
        return text.Length > TextLimit ? text[..TextLimit] : text;
    }

    private static string? PreviewOf(string? text)
    {
        if (text is null) return null;
        var flat = Whitespace().Replace(text, " ").Trim();
        return flat.Length > 160 ? flat[..160] + "…" : flat;
    }

    private static List<InboundAttachment> Attachments(byte[] raw)
    {
        try
        {
            using var stream = new MemoryStream(raw, writable: false);
            var msg = MimeMessage.Load(stream);
            var list = new List<InboundAttachment>();
            foreach (var a in msg.Attachments)
            {
                long size = 0;
                string? name = null;
                if (a is MimePart part)
                {
                    name = part.FileName;
                    using var ms = new MemoryStream();
                    part.Content?.DecodeTo(ms);
                    size = ms.Length;
                }
                else if (a is MessagePart mp)
                {
                    name = mp.Message?.Subject is { Length: > 0 } s ? s + ".eml" : null;
                }
                list.Add(new InboundAttachment(name ?? a.ContentType.Name ?? "příloha", a.ContentType.MimeType, size));
            }
            return list;
        }
        catch (FormatException)
        {
            return [];
        }
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Length > max ? s[..max] : s.Trim();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex ManyBlankLines();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}

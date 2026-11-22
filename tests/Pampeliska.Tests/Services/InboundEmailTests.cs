using System.Text;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class InboundEmailTests
{
    /// <summary>Ukázková notifikace banky jako surový e-mail (RFC 5322).</summary>
    public static byte[] Notification(string subject = "Pohyb na účtu 2401234567", string? messageId = null, string? html = null,
        (string Name, byte[] Data)? attachment = null)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress("Fio banka", "automat@fio.cz"));
        msg.To.Add(MailboxAddress.Parse("banky-test@pampeliska.nadrasky.cz"));
        msg.Subject = subject;
        msg.Date = new DateTimeOffset(2026, 9, 28, 14, 5, 0, TimeSpan.FromHours(2));
        msg.MessageId = messageId ?? MimeKit.Utils.MimeUtils.GenerateMessageId("fio.cz");
        var body = new BodyBuilder();
        if (html is not null) body.HtmlBody = html;
        else body.TextBody = "Pohyb na účtu: 2401234567/2010\nČástka: -349,00 CZK\n\n\n\nProtistrana: ALBERT 0712 BRNO";
        if (attachment is { } a) body.Attachments.Add(a.Name, a.Data, new ContentType("application", "pdf"));
        msg.Body = body.ToMessageBody();
        using var ms = new MemoryStream();
        msg.WriteTo(ms);
        return ms.ToArray();
    }

    [Fact]
    public async Task Address_is_created_once_and_recognized()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var a = await svc.AddressAsync();
        Assert.Matches("^banky-[a-z0-9]{10}@pampeliska\\.nadrasky\\.cz$", a.Address);
        Assert.Equal(a.Address, (await svc.AddressAsync()).Address);
        Assert.True(await svc.IsKnownRecipientAsync(a.Address.ToUpperInvariant()));
        Assert.False(await svc.IsKnownRecipientAsync("banky-jinytoken1@pampeliska.nadrasky.cz"));
        Assert.False(await svc.IsKnownRecipientAsync(a.Address.Replace("nadrasky.cz", "example.cz")));
    }

    [Fact]
    public async Task Regenerated_address_replaces_old_one()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var old = (await svc.AddressAsync()).Address;
        var fresh = (await svc.RegenerateAsync()).Address;
        Assert.NotEqual(old, fresh);
        Assert.False(await svc.IsKnownRecipientAsync(old));
        Assert.True(await svc.IsKnownRecipientAsync(fresh));
    }

    [Fact]
    public async Task Unknown_recipient_without_token_is_rejected()
    {
        using var env = new TestEnv();
        Assert.False(await env.Get<InboundEmailService>().IsKnownRecipientAsync("banky-@pampeliska.nadrasky.cz"));
    }

    [Fact]
    public async Task Stores_headers_text_and_attachments()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var pdf = Encoding.ASCII.GetBytes("%PDF-1.4 ukázka výpisu");
        var r = await svc.StoreAsync(Notification(attachment: ("Vypis_202608.pdf", pdf)), InboundEmailSource.Smtp, "bounce@fio.cz",
            "banky-test@pampeliska.nadrasky.cz", "192.0.2.10");
        Assert.False(r.Duplicate);

        var d = await svc.DetailAsync(r.Id);
        Assert.Equal("Pohyb na účtu 2401234567", d.Email.Subject);
        Assert.Equal("Fio banka", d.Email.FromName);
        Assert.Equal("automat@fio.cz", d.Email.FromAddress);
        Assert.Equal(InboundEmailState.Received, d.Email.State);
        Assert.Equal("bounce@fio.cz", d.EnvelopeFrom);
        Assert.Equal("192.0.2.10", d.RemoteIp);
        Assert.Equal(new DateTimeOffset(2026, 9, 28, 12, 5, 0, TimeSpan.Zero), d.SentAt);
        Assert.Contains("Částka: -349,00 CZK", d.TextBody);
        Assert.DoesNotContain("\n\n\n", d.TextBody);
        Assert.StartsWith("Pohyb na účtu: 2401234567/2010 Částka", d.Email.Preview);
        Assert.Equal(1, d.Email.AttachmentCount);
        var att = Assert.Single(d.Attachments);
        Assert.Equal("Vypis_202608.pdf", att.Name);
        Assert.Equal("application/pdf", att.ContentType);
        Assert.Equal(pdf.Length, att.SizeBytes);
        Assert.True(d.HasRaw);
    }

    [Fact]
    public async Task Html_only_email_is_converted_to_text()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var r = await svc.StoreAsync(Notification(html: "<html><body><p>Zaplatili jste <b>1 240,00 Kč</b></p><p>Shell Modřice</p></body></html>"),
            InboundEmailSource.Upload);
        var d = await svc.DetailAsync(r.Id);
        Assert.Contains("Zaplatili jste 1 240,00 Kč", d.TextBody);
        Assert.Contains("Shell Modřice", d.TextBody);
        Assert.DoesNotContain("<b>", d.TextBody);
    }

    [Fact]
    public async Task Same_message_id_is_stored_once()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var raw = Notification(messageId: "abc123@fio.cz");
        var first = await svc.StoreAsync(raw, InboundEmailSource.Smtp);
        var again = await svc.StoreAsync(raw, InboundEmailSource.Smtp);
        Assert.True(again.Duplicate);
        Assert.Equal(first.Id, again.Id);
        Assert.Equal(1, await env.FreshDb().InboundEmails.CountAsync());
    }

    [Fact]
    public async Task Upload_of_non_email_fails_but_smtp_keeps_it_as_failed()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var junk = Encoding.UTF8.GetBytes("tohle není e-mail");
        var ex = await Assert.ThrowsAsync<DomainException>(() => svc.StoreAsync(junk, InboundEmailSource.Upload));
        Assert.Contains(".eml", ex.Message);

        var r = await svc.StoreAsync(junk, InboundEmailSource.Smtp);
        var d = await svc.DetailAsync(r.Id);
        Assert.Equal(InboundEmailState.Failed, d.Email.State);
        Assert.NotNull(d.Error);
        Assert.True(d.HasRaw);
    }

    [Fact]
    public async Task Too_big_email_is_rejected()
    {
        using var env = new TestEnv();
        var big = new byte[10 * 1024 * 1024 + 1];
        await Assert.ThrowsAsync<DomainException>(() => env.Get<InboundEmailService>().StoreAsync(big, InboundEmailSource.Smtp));
    }

    [Fact]
    public async Task Raw_email_is_purged_after_retention()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var r = await svc.StoreAsync(Notification(), InboundEmailSource.Smtp);
        Assert.NotEmpty((await svc.RawAsync(r.Id)).Raw);

        env.Clock.Advance(TimeSpan.FromDays(29));
        await svc.RunAsync(CancellationToken.None);
        Assert.True((await svc.DetailAsync(r.Id)).HasRaw);

        env.Clock.Advance(TimeSpan.FromDays(2));
        await svc.RunAsync(CancellationToken.None);
        var d = await svc.DetailAsync(r.Id);
        Assert.False(d.HasRaw);
        Assert.NotNull(d.RawPurgedAt);
        Assert.Contains("Částka", d.TextBody);
        await Assert.ThrowsAsync<DomainException>(() => svc.RawAsync(r.Id));
    }

    [Fact]
    public async Task Received_emails_do_not_raise_badge_and_are_listed_newest_first()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        await svc.StoreAsync(Notification("První"), InboundEmailSource.Smtp);
        env.Clock.Advance(TimeSpan.FromMinutes(5));
        await svc.StoreAsync(Notification("Druhý"), InboundEmailSource.Smtp);
        Assert.Equal(["Druhý", "První"], (await svc.ListAsync()).Select(e => e.Subject));
        Assert.Equal(0, await svc.NeedsAttentionCountAsync());
        Assert.Equal(0, (await env.Get<NotificationService>().BadgesAsync()).InboundEmails);
    }

    [Fact]
    public async Task Delete_removes_email()
    {
        using var env = new TestEnv();
        var svc = env.Get<InboundEmailService>();
        var r = await svc.StoreAsync(Notification(), InboundEmailSource.Smtp);
        await svc.DeleteAsync(r.Id);
        Assert.Empty(await svc.ListAsync());
        await Assert.ThrowsAsync<DomainException>(() => svc.DetailAsync(r.Id));
    }
}

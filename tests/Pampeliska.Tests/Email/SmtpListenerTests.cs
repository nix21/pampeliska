using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using MailKit;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.AspNetCore.Hosting;
using MimeKit;
using Pampeliska.Tests.Mcp;
using Pampeliska.Tests.Services;

namespace Pampeliska.Tests.Email;

/// <summary>Celé API se zapnutým SMTP příjmem na volném lokálním portu (bez TLS).</summary>
public class SmtpFactory : PampeliskaFactory
{
    public int Port { get; } = FreePort();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Email:Enabled", "true");
        builder.UseSetting("Email:Port", Port.ToString());
    }

    private static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }
}

public class SmtpListenerTests(SmtpFactory factory) : IClassFixture<SmtpFactory>
{
    private async Task<SmtpClient> ConnectAsync()
    {
        var client = new SmtpClient();
        for (var i = 0; ; i++)
        {
            try
            {
                await client.ConnectAsync("127.0.0.1", factory.Port, SecureSocketOptions.None);
                return client;
            }
            catch (SocketException) when (i < 50)
            {
                await Task.Delay(100); // server se teprve spouští
            }
        }
    }

    [Fact]
    public async Task Accepts_mail_for_household_address_and_rejects_others()
    {
        var browser = factory.Browser();
        await browser.GetAsync("/auth/login");
        var address = (await browser.GetFromJsonAsync<JsonElement>("/api/inbound-emails/address")).GetProperty("address").GetString()!;

        using var smtp = await ConnectAsync();
        var msg = MimeMessage.Load(new MemoryStream(InboundEmailTests.Notification("Platba kartou přes SMTP")));
        await smtp.SendAsync(new SendRequest(msg, MailboxAddress.Parse("automat@fio.cz"), [MailboxAddress.Parse(address)]));

        var wrong = MimeMessage.Load(new MemoryStream(InboundEmailTests.Notification("Cizí adresát")));
        var ex = await Assert.ThrowsAsync<SmtpCommandException>(() =>
            smtp.SendAsync(new SendRequest(wrong, MailboxAddress.Parse("spam@example.com"), [MailboxAddress.Parse("nekdo@pampeliska.nadrasky.cz")])));
        Assert.Equal(SmtpErrorCode.RecipientNotAccepted, ex.ErrorCode);
        await smtp.DisconnectAsync(true);

        var list = await browser.GetFromJsonAsync<JsonElement>("/api/inbound-emails");
        var mail = Assert.Single(list.EnumerateArray(), e => e.GetProperty("subject").GetString() == "Platba kartou přes SMTP");
        Assert.Equal("Smtp", mail.GetProperty("source").GetString());
        Assert.DoesNotContain(list.EnumerateArray(), e => e.GetProperty("subject").GetString() == "Cizí adresát");

        var detail = await browser.GetFromJsonAsync<JsonElement>($"/api/inbound-emails/{mail.GetProperty("id").GetInt32()}");
        Assert.Equal("automat@fio.cz", detail.GetProperty("envelopeFrom").GetString());
        Assert.Equal(address, detail.GetProperty("envelopeTo").GetString());
        Assert.Equal("127.0.0.1", detail.GetProperty("remoteIp").GetString());

        var raw = await browser.GetAsync($"/api/inbound-emails/{mail.GetProperty("id").GetInt32()}/raw");
        Assert.Equal(HttpStatusCode.OK, raw.StatusCode);
        Assert.Equal("message/rfc822", raw.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Upload_endpoint_stores_eml()
    {
        var browser = factory.Browser();
        await browser.GetAsync("/auth/login");
        var content = new ByteArrayContent(InboundEmailTests.Notification("Nahraný e-mail"));
        content.Headers.ContentType = new("message/rfc822");
        var r = await browser.PostAsync("/api/inbound-emails", content);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);

        var bad = new ByteArrayContent("nic"u8.ToArray());
        var rBad = await browser.PostAsync("/api/inbound-emails", bad);
        Assert.Equal(HttpStatusCode.BadRequest, rBad.StatusCode);
    }
}

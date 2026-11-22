using System.Buffers;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Options;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;
using SmtpServer;
using SmtpServer.Mail;
using SmtpServer.Net;
using SmtpServer.Protocol;
using SmtpServer.Storage;

namespace Pampeliska.Api.Email;

/// <summary>
/// SMTP server jen pro příjem pošty na adresu domácnosti (MX záznam míří na VPS, port 25 → kontejner 2525).
/// Nic dál nepředává (žádný relay): adresáta, který nepatří domácnosti, odmítne už při RCPT TO.
/// E-mail potvrdí (250) až po uložení do databáze, takže při výpadku ho odesílatel doručí znovu.
/// </summary>
public class SmtpListener(IServiceScopeFactory scopes, IOptions<InboundEmailOptions> options, ILogger<SmtpListener> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var o = options.Value;
        var certificate = new PemCertificateSource(o.CertificatePath, o.CertificateKeyPath, log);
        // Certifikát kopíruje vedlejší kontejner (certsync) – při prvním startu může chvíli chybět
        for (var i = 0; i < 12 && !string.IsNullOrEmpty(o.CertificatePath) && !certificate.Available; i++)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
        var smtpOptions = new SmtpServerOptionsBuilder()
            .ServerName(o.Domain)
            .MaxMessageSize(o.MaxSizeBytes, MaxMessageSizeHandling.Strict)
            .Endpoint(b =>
            {
                b.Port(o.Port, false).SessionTimeout(TimeSpan.FromMinutes(2));
                if (certificate.Available) b.Certificate(certificate);
            })
            .Build();
        var services = new SmtpServer.ComponentModel.ServiceProvider();
        services.Add(new RecipientFilter(scopes));
        services.Add(new DatabaseMessageStore(scopes, log));
        var server = new SmtpServer.SmtpServer(smtpOptions, services);
        server.SessionFaulted += (_, e) => log.LogDebug(e.Exception, "SMTP relace skončila chybou");

        log.LogInformation("Příjem e-mailů běží na portu {Port} pro doménu {Domain} ({Tls})", o.Port, o.Domain,
            certificate.Available ? "STARTTLS" : "bez TLS – chybí certifikát");
        try
        {
            await server.StartAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception e)
        {
            // Např. obsazený port – příjem e-mailů nepoběží, ale zbytek aplikace ano
            log.LogError(e, "Příjem e-mailů se nepodařilo spustit na portu {Port}", o.Port);
        }
    }

    /// <summary>Přijímá jen poštu pro adresu domácnosti.</summary>
    private sealed class RecipientFilter(IServiceScopeFactory scopes) : IMailboxFilter
    {
        public Task<bool> CanAcceptFromAsync(ISessionContext context, IMailbox from, int size, CancellationToken cancellationToken) => Task.FromResult(true);

        public async Task<bool> CanDeliverToAsync(ISessionContext context, IMailbox to, IMailbox from, CancellationToken cancellationToken)
        {
            using var scope = scopes.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<InboundEmailService>().IsKnownRecipientAsync(to.AsAddress());
        }
    }

    private sealed class DatabaseMessageStore(IServiceScopeFactory scopes, ILogger log) : MessageStore
    {
        public override async Task<SmtpResponse> SaveAsync(ISessionContext context, IMessageTransaction transaction, ReadOnlySequence<byte> buffer,
            CancellationToken cancellationToken)
        {
            var remote = context.Properties.TryGetValue(EndpointListener.RemoteEndPointKey, out var ep) && ep is IPEndPoint ip ? ip.Address.ToString() : null;
            var from = transaction.From is { } f && !string.IsNullOrEmpty(f.User) ? f.AsAddress() : null;
            var to = transaction.To.FirstOrDefault()?.AsAddress();
            try
            {
                using var scope = scopes.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<InboundEmailService>();
                var r = await svc.StoreAsync(buffer.ToArray(), InboundEmailSource.Smtp, from, to, remote, cancellationToken);
                log.LogInformation("Přijat e-mail {Id} od {From} ({Size} B){Dup}", r.Id, from, buffer.Length, r.Duplicate ? " – duplicita, neuložen" : "");
                return SmtpResponse.Ok;
            }
            catch (DomainException e)
            {
                log.LogWarning("E-mail od {From} odmítnut: {Error}", from, e.Message);
                return new SmtpResponse(SmtpReplyCode.TransactionFailed, e.Message);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // Dočasná chyba (např. nedostupná databáze) – odesílatel to zkusí znovu
                log.LogError(e, "Uložení e-mailu od {From} selhalo", from);
                return new SmtpResponse(SmtpReplyCode.Aborted, "Dočasná chyba, zkuste to později");
            }
        }
    }
}

/// <summary>
/// Certifikát pro STARTTLS z PEM souborů (např. ty, které spravuje Caddy). Při změně souboru (obnova certifikátu) se načte znovu.
/// </summary>
public sealed class PemCertificateSource(string? certPath, string? keyPath, ILogger log) : ICertificateFactory
{
    private readonly Lock _lock = new();
    private X509Certificate2? _cert;
    private DateTime _loadedFor;

    public bool Available => !string.IsNullOrEmpty(certPath) && !string.IsNullOrEmpty(keyPath) && File.Exists(certPath) && File.Exists(keyPath) && Load() is not null;

    public X509Certificate GetServerCertificate(ISessionContext sessionContext) =>
        Load() ?? throw new InvalidOperationException("Certifikát pro STARTTLS není k dispozici.");

    private X509Certificate2? Load()
    {
        lock (_lock)
        {
            try
            {
                var stamp = File.GetLastWriteTimeUtc(certPath!);
                if (_cert is not null && stamp == _loadedFor) return _cert;
                using var pem = X509Certificate2.CreateFromPemFile(certPath!, keyPath);
                // Přes PKCS#12, aby klíč fungoval se SslStream i na Windows
                _cert = X509CertificateLoader.LoadPkcs12(pem.Export(X509ContentType.Pkcs12), null);
                _loadedFor = stamp;
                log.LogInformation("Načten certifikát pro STARTTLS: {Subject}, platný do {NotAfter:d}", _cert.Subject, _cert.NotAfter);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException)
            {
                log.LogWarning("Certifikát pro STARTTLS nejde načíst: {Error}", e.Message);
            }
            return _cert;
        }
    }
}

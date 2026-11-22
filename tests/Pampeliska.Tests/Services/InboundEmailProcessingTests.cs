using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MimeKit;
using MimeKit.Cryptography;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.X509;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Integrations;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

/// <summary>Extractor bez volání API – vrací, co test nastaví.</summary>
public class FakeExtractor : INotificationExtractor
{
    public bool Available { get; set; } = true;
    public Func<ExtractionInput, ExtractedNotification> Handler { get; set; } = _ => new("other", [], "Nic");
    public List<ExtractionInput> Calls { get; } = [];

    public Task<ExtractedNotification> ExtractAsync(ExtractionInput input, CancellationToken ct = default)
    {
        Calls.Add(input);
        return Task.FromResult(Handler(input));
    }
}

/// <summary>DNS s veřejnými klíči DKIM testovacích domén.</summary>
public class FakeDns : IDnsResolver
{
    public Dictionary<string, string> Txt { get; } = new(StringComparer.OrdinalIgnoreCase);
    public DnsTxtResponse QueryTxt(string domain, CancellationToken cancellationToken = default) =>
        Txt.TryGetValue(domain, out var v) ? new DnsTxtResponse([v]) : new DnsTxtResponse(DnsQueryStatus.NonExistentDomain);
    public Task<DnsTxtResponse> QueryTxtAsync(string domain, CancellationToken cancellationToken = default) => Task.FromResult(QueryTxt(domain, cancellationToken));
}

public class InboundEmailProcessingTests
{
    private static readonly AsymmetricCipherKeyPair Keys = GenerateKeys();

    private static AsymmetricCipherKeyPair GenerateKeys()
    {
        var g = new RsaKeyPairGenerator();
        g.Init(new KeyGenerationParameters(new SecureRandom(), 2048));
        return g.GenerateKeyPair();
    }

    private static string DkimTxt() =>
        "v=DKIM1; k=rsa; p=" + Convert.ToBase64String(SubjectPublicKeyInfoFactory.CreateSubjectPublicKeyInfo(Keys.Public).GetEncoded());

    private sealed class Ctx : IDisposable
    {
        public FakeExtractor Ai { get; } = new();
        public FakeDns Dns { get; } = new();
        public TestEnv Env { get; }

        public Ctx()
        {
            Env = new TestEnv(s =>
            {
                s.AddSingleton<INotificationExtractor>(Ai);
                s.AddSingleton<IDnsResolver>(Dns);
            });
            foreach (var d in new[] { "fio.cz", "csas.cz", "moneta.cz", "neznama-banka.cz" }) Dns.Txt[$"sel._domainkey.{d}"] = DkimTxt();
        }

        public InboundEmailProcessor Processor => Env.Get<InboundEmailProcessor>();
        public InboundEmailService Emails => Env.Get<InboundEmailService>();
        public void Dispose() => Env.Dispose();

        /// <summary>Uloží notifikaci; <paramref name="signedBy"/> = doména, která e-mail podepíše DKIM (null = bez podpisu).</summary>
        public async Task<int> ReceiveAsync(string? signedBy = "fio.cz", string from = "automat@fio.cz", string text = "Pohyb na účtu")
        {
            var msg = new MimeMessage();
            msg.From.Add(MailboxAddress.Parse(from));
            msg.To.Add(MailboxAddress.Parse("banky-test@pampeliska.nadrasky.cz"));
            msg.Subject = "Pohyb na účtu";
            msg.Date = new DateTimeOffset(2026, 9, 28, 9, 0, 0, TimeSpan.FromHours(2));
            msg.MessageId = MimeKit.Utils.MimeUtils.GenerateMessageId("test");
            msg.Body = new TextPart("plain") { Text = text };
            if (signedBy is not null)
            {
                msg.Prepare(EncodingConstraint.SevenBit);
                var signer = new DkimSigner(Keys.Private, signedBy, "sel", DkimSignatureAlgorithm.RsaSha256)
                {
                    HeaderCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed,
                    BodyCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed,
                };
                signer.Sign(msg, [HeaderId.From, HeaderId.Subject, HeaderId.Date, HeaderId.MessageId]);
            }
            using var ms = new MemoryStream();
            msg.WriteTo(ms);
            return (await Emails.StoreAsync(ms.ToArray(), InboundEmailSource.Smtp)).Id;
        }
    }

    private static ExtractedMovement Card(decimal amount, string counterparty, string? account = null, string? card = null, string date = "2026-09-28",
        string currency = "CZK") =>
        new(date, "08:55", amount, currency, account, card, counterparty, null, null, null, "Card", true, null);

    private static ExtractedNotification Movements(params ExtractedMovement[] m) => new("movements", [.. m], null);

    [Fact]
    public async Task Signed_notification_is_imported_as_provisional_transaction()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-349, "Albert Brno", account: "2900111222"));
        var id = await c.ReceiveAsync(text: "Částka: -349,00 CZK");

        Assert.Equal(InboundEmailState.Imported, await c.Processor.ProcessAsync(id));
        var d = await c.Emails.DetailAsync(id);
        Assert.Equal("fio.cz", d.DkimDomain);
        Assert.True(d.SenderAllowed);
        var tx = Assert.Single(d.Transactions);
        Assert.Equal("Společný účet", tx.Account);
        Assert.Equal(-349m, tx.Amount);
        Assert.True(tx.Provisional);
        Assert.Equal("movements", d.Extracted!.Kind);
        Assert.Contains("Částka", c.Ai.Calls.Single().Text);

        var t = await c.Env.FreshDb().Transactions.Include(x => x.Batch).SingleAsync(x => x.Id == tx.Id);
        Assert.Equal(BatchSource.Email, t.Batch!.Source);
        Assert.Equal("Notifikace 28. 9.", t.Batch.Note);
        Assert.Equal(PaymentType.Card, t.PaymentType);
        Assert.Equal(new TimeOnly(8, 55), t.Time);
        Assert.Equal(TransactionStatus.Suggested, t.Status);
    }

    [Fact]
    public async Task Notifications_of_one_day_share_a_batch()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-120, "Lidl", account: "2900111222"));
        await c.Processor.ProcessAsync(await c.ReceiveAsync());
        c.Ai.Handler = _ => Movements(Card(-80, "Rohlik", account: "2900111222"));
        await c.Processor.ProcessAsync(await c.ReceiveAsync());
        var batches = await c.Env.FreshDb().ImportBatches.Where(b => b.Source == BatchSource.Email).ToListAsync();
        Assert.Single(batches);
    }

    [Fact]
    public async Task Unsigned_email_goes_to_quarantine_unless_forced()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-349, "Albert", account: "2900111222"));
        var id = await c.ReceiveAsync(signedBy: null);

        Assert.Equal(InboundEmailState.Quarantined, await c.Processor.ProcessAsync(id));
        Assert.Empty(c.Ai.Calls);
        Assert.Contains("podpis", (await c.Emails.DetailAsync(id)).Note);
        Assert.Equal(1, await c.Emails.NeedsAttentionCountAsync());

        Assert.Equal(InboundEmailState.Imported, await c.Processor.ProcessAsync(id, force: true));
        Assert.Equal(0, await c.Emails.NeedsAttentionCountAsync());
    }

    [Fact]
    public async Task Unknown_sender_is_quarantined_until_allowed()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-50, "Kavárna", account: "2900111222"));
        var id = await c.ReceiveAsync(signedBy: "neznama-banka.cz", from: "info@neznama-banka.cz");

        Assert.Equal(InboundEmailState.Quarantined, await c.Processor.ProcessAsync(id));
        var d = await c.Emails.DetailAsync(id);
        Assert.Equal("neznama-banka.cz", d.DkimDomain);
        Assert.False(d.SenderAllowed);

        await c.Processor.SetSenderAsync("neznama-banka.cz", true);
        Assert.Equal(InboundEmailState.Imported, await c.Processor.ProcessAsync(id));
        Assert.Contains(await c.Processor.SendersAsync(), s => s.Domain == "neznama-banka.cz" && s.Enabled && !s.Known);
    }

    [Fact]
    public async Task Disabled_known_bank_is_quarantined()
    {
        using var c = new Ctx();
        await c.Processor.SetSenderAsync("fio.cz", false);
        var id = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.Quarantined, await c.Processor.ProcessAsync(id));
        Assert.Contains(await c.Processor.SendersAsync(), s => s.Domain == "fio.cz" && !s.Enabled && s.Known);
    }

    [Fact]
    public async Task Unknown_card_asks_for_account_and_remembers_it()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-486, "Dr. Max", card: "**** 7731"));
        var id = await c.ReceiveAsync();

        Assert.Equal(InboundEmailState.NeedsAccount, await c.Processor.ProcessAsync(id));
        Assert.Contains("7731", (await c.Emails.DetailAsync(id)).Note);

        Assert.Equal(InboundEmailState.Imported, await c.Processor.AssignAccountAsync(id, c.Env.Spolecny.Id, rememberCard: true));
        Assert.Equal(["7731"], (await c.Env.FreshDb().Accounts.SingleAsync(a => a.Id == c.Env.Spolecny.Id)).CardSuffixes);

        c.Ai.Handler = _ => Movements(Card(-99, "Lékárna", card: "7731"));
        var next = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.Imported, await c.Processor.ProcessAsync(next));
        Assert.Equal("Společný účet", Assert.Single((await c.Emails.DetailAsync(next)).Transactions).Account);
    }

    [Fact]
    public async Task Only_current_account_of_sender_bank_is_used()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-1240, "Shell"));
        var id = await c.ReceiveAsync(signedBy: "csas.cz", from: "george@csas.cz");
        Assert.Equal(InboundEmailState.Imported, await c.Processor.ProcessAsync(id));
        Assert.Equal("Běžný účet", Assert.Single((await c.Emails.DetailAsync(id)).Transactions).Account);
    }

    [Fact]
    public async Task Other_and_statement_emails_are_not_movements()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => new ExtractedNotification("other", [], "Přihlášení do internetového bankovnictví.");
        var id = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.NotMovement, await c.Processor.ProcessAsync(id));
        Assert.Equal("Přihlášení do internetového bankovnictví.", (await c.Emails.DetailAsync(id)).Note);

        c.Ai.Handler = _ => new ExtractedNotification("statement", [], "Výpis za srpen.");
        var st = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.NotMovement, await c.Processor.ProcessAsync(st));
        Assert.Contains("Výpis", (await c.Emails.DetailAsync(st)).Note);
    }

    [Fact]
    public async Task Foreign_currency_or_odd_date_fails_with_reason()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-12.5m, "Amazon", account: "2900111222", currency: "EUR"));
        var id = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.Failed, await c.Processor.ProcessAsync(id));
        Assert.Contains("EUR", (await c.Emails.DetailAsync(id)).Note);
        Assert.Empty(await c.Env.FreshDb().Transactions.Where(t => t.InboundEmailId == id).ToListAsync());

        c.Ai.Handler = _ => Movements(Card(-10, "Starý", account: "2900111222", date: "2025-01-01"));
        Assert.Equal(InboundEmailState.Failed, await c.Processor.ProcessAsync(await c.ReceiveAsync()));
    }

    [Fact]
    public async Task Same_movement_twice_is_flagged_as_suspected_duplicate()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-349, "Albert Brno", account: "2900111222"));
        await c.Processor.ProcessAsync(await c.ReceiveAsync());
        var second = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.Imported, await c.Processor.ProcessAsync(second));
        Assert.Contains("duplicitu", (await c.Emails.DetailAsync(second)).Note);
        // Dvě stejné platby za den jsou možné – druhá vznikne, ale čeká na rozhodnutí jako podezřelá duplicita
        var txs = await c.Env.FreshDb().Transactions.Where(t => t.InboundEmailId != null).OrderBy(t => t.Id).ToListAsync();
        Assert.Equal(2, txs.Count);
        Assert.Equal(txs[0].Id, txs[1].SuspectedDuplicateOfId);
    }

    private sealed class FailingExtractor : INotificationExtractor
    {
        public bool Available => true;
        public Task<ExtractedNotification> ExtractAsync(ExtractionInput input, CancellationToken ct = default) =>
            throw new TransientExtractionException("Claude API je přetížené.");
    }

    [Fact]
    public async Task Transient_error_keeps_email_for_retry_then_fails()
    {
        var dns = new FakeDns { Txt = { ["sel._domainkey.fio.cz"] = DkimTxt() } };
        using var env = new TestEnv(s =>
        {
            s.AddSingleton<INotificationExtractor>(new FailingExtractor());
            s.AddSingleton<IDnsResolver>(dns);
        });
        var msg = new MimeMessage();
        msg.From.Add(MailboxAddress.Parse("automat@fio.cz"));
        msg.Subject = "Pohyb";
        msg.Body = new TextPart("plain") { Text = "Pohyb" };
        using var ms = new MemoryStream();
        msg.WriteTo(ms);
        var id = (await env.Get<InboundEmailService>().StoreAsync(ms.ToArray(), InboundEmailSource.Smtp)).Id;
        var p = env.Get<InboundEmailProcessor>();
        for (var i = 1; i < InboundEmailProcessor.MaxAttempts; i++)
            Assert.Equal(InboundEmailState.Received, await p.ProcessAsync(id, force: true));
        Assert.Equal(InboundEmailState.Failed, await p.ProcessAsync(id, force: true));
    }

    [Fact]
    public async Task Without_api_key_emails_stay_received()
    {
        using var c = new Ctx();
        c.Ai.Available = false;
        var id = await c.ReceiveAsync();
        Assert.Equal(InboundEmailState.Received, await c.Processor.ProcessAsync(id));
        var d = await c.Emails.DetailAsync(id);
        Assert.False(d.ExtractionAvailable);
        Assert.Contains("klíč", d.Note);
    }

    [Fact]
    public async Task Imported_email_cannot_be_processed_again()
    {
        using var c = new Ctx();
        c.Ai.Handler = _ => Movements(Card(-349, "Albert", account: "2900111222"));
        var id = await c.ReceiveAsync();
        await c.Processor.ProcessAsync(id);
        await Assert.ThrowsAsync<DomainException>(() => c.Processor.ProcessAsync(id));
    }

    [Fact]
    public async Task Card_suffixes_are_validated()
    {
        using var c = new Ctx();
        await c.Processor.SetCardsAsync(c.Env.Bezny.Id, ["1190", "**** 5530", "1190"]);
        Assert.Equal(["1190", "5530"], (await c.Processor.AccountsAsync()).Single(a => a.Id == c.Env.Bezny.Id).CardSuffixes);
        await Assert.ThrowsAsync<DomainException>(() => c.Processor.SetCardsAsync(c.Env.Bezny.Id, ["12"]));
    }

    [Theory]
    [InlineData("2900111222/2010", "2900111222", true)]
    [InlineData("2900111222/2010", "2900111222/2010", true)]
    [InlineData("2900111222/2010", "2900111222/0800", false)]
    [InlineData("2900111222/2010", "****1222", true)]
    [InlineData("2900111222/2010", "xxxxxx1222/2010", true)]
    [InlineData("2900111222/2010", "****9999", false)]
    [InlineData("123-4567890/0800", "123-4567890", true)]
    [InlineData("123-4567890/0800", "4567890", true)]
    [InlineData("123-4567890/0800", "567890", true)]
    [InlineData("123-4567890/0800", "890", false)]
    [InlineData(null, "2900111222", false)]
    public void Account_number_from_email_matches(string? iban, string hint, bool expected) =>
        Assert.Equal(expected, InboundEmailProcessor.AccountMatches(iban, hint));

    [Fact]
    public void Extracted_json_round_trips()
    {
        var n = Movements(Card(-1, "X", account: "1"));
        var back = JsonSerializer.Deserialize<ExtractedNotification>(JsonSerializer.Serialize(n, ClaudeNotificationExtractor.Json), ClaudeNotificationExtractor.Json);
        Assert.Equal(n.Movements[0], back!.Movements[0]);
    }
}

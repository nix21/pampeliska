using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

/// <summary>Párování výpisu s předběžnými pohyby z e-mailových notifikací a stav „Není ve výpisu“ (docs/email-notifikace.md kap. 4).</summary>
public class StatementReconciliationTests
{
    private static readonly DateOnly Sep1 = new(2026, 9, 1), Sep30 = new(2026, 9, 30);

    /// <summary>Předběžný pohyb tak, jak ho zapíše zpracování e-mailu.</summary>
    private static async Task<int> NotificationAsync(TestEnv env, Account account, string date, decimal amount, string counterparty,
        PaymentType type = PaymentType.Card)
    {
        var r = await env.Get<ImportService>().ImportAsync(account.Id, [new ImportItem(DateOnly.Parse(date), amount, counterparty, PaymentType: type)],
            new ImportOptions(BatchSource.Email, "E-mail z banky", Note: "Notifikace"));
        var t = await env.Db.Transactions.FirstAsync(x => x.Id == r.TransactionIds[0]);
        t.Provisional = true;
        await env.Db.SaveChangesAsync();
        return t.Id;
    }

    private static Task<ImportResult> StatementAsync(TestEnv env, Account account, IReadOnlyList<ImportItem> items, DateOnly? from = null, DateOnly? to = null,
        int? batchId = null) =>
        env.Get<ImportService>().ImportAsync(account.Id, items,
            new ImportOptions(BatchSource.Mcp, "Claude", env.Vasek.Id, "client", "Test", "Výpis 09/2026", batchId, from, to));

    private static ImportItem Row(string date, decimal amount, string counterparty, PaymentType type = PaymentType.Card, string? ext = null) =>
        new(DateOnly.Parse(date), amount, counterparty, PaymentType: type, ExternalId: ext, RawText: $"{date} {counterparty} {amount}");

    [Fact]
    public async Task Card_payment_is_confirmed_by_statement_with_booking_date()
    {
        using var env = new TestEnv();
        var id = await NotificationAsync(env, env.Spolecny, "2026-09-22", -349, "ALBERT 0712 BRNO");
        var food = env.Cat("Supermarkety"); // kategorie a potvrzení zůstanou
        (await env.Db.Transactions.FirstAsync(t => t.Id == id)).CategoryId = food;
        await env.Db.SaveChangesAsync();
        await env.Get<TransactionService>().ConfirmAsync([id], "Vašek");

        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-24", -349, "Albert Brno", ext: "FIO-1")], Sep1, Sep30);

        Assert.Equal(1, r.Reconciled);
        Assert.Equal(0, r.Created);
        Assert.Equal(0, r.SuspectedDuplicates);
        var t = await env.FreshDb().Transactions.Include(x => x.Events).SingleAsync(x => x.AccountId == env.Spolecny.Id);
        Assert.Equal(id, t.Id);
        Assert.Equal(new DateOnly(2026, 9, 24), t.Date);
        Assert.Equal("Albert Brno", t.Counterparty);
        Assert.Equal("FIO-1", t.ExternalId);
        Assert.False(t.Provisional);
        Assert.Equal(TransactionStatus.Confirmed, t.Status);
        Assert.Equal(food, t.CategoryId);
        Assert.Contains(t.Events, e => e.Text == "Potvrzeno výpisem");
        Assert.Equal(1, (await env.FreshDb().ImportBatches.SingleAsync(b => b.Id == r.BatchId)).ReconciledCount);
    }

    [Fact]
    public async Task Foreign_card_payment_within_tolerance_takes_statement_amount()
    {
        using var env = new TestEnv();
        var id = await NotificationAsync(env, env.Spolecny, "2026-09-10", -1240, "AMAZON EU");
        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-12", -1262.40m, "AMAZON EU SARL")], Sep1, Sep30);

        Assert.Equal(1, r.Reconciled);
        var t = await env.FreshDb().Transactions.Include(x => x.Events).SingleAsync(x => x.Id == id);
        Assert.Equal(-1262.40m, t.Amount);
        Assert.Equal(-1262.40m, t.AmountCzk);
        Assert.Contains(t.Events, e => e.Text.Contains("částka upravena"));
    }

    [Fact]
    public async Task Different_amount_is_not_matched_and_missing_one_is_flagged()
    {
        using var env = new TestEnv();
        var id = await NotificationAsync(env, env.Spolecny, "2026-09-05", -500, "Rohlik.cz");
        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-06", -460, "Rohlik.cz")], Sep1, Sep30);

        Assert.Equal(0, r.Reconciled);
        Assert.Equal(1, r.Created);
        Assert.Equal(1, r.NotInStatement);
        var t = await env.FreshDb().Transactions.SingleAsync(x => x.Id == id);
        Assert.True(t.Provisional);
        Assert.True(t.NotInStatement);
    }

    [Fact]
    public async Task Only_provisional_inside_period_and_before_its_tail_are_flagged()
    {
        using var env = new TestEnv();
        var inside = await NotificationAsync(env, env.Spolecny, "2026-09-05", -500, "Rohlik.cz");
        var tail = await NotificationAsync(env, env.Spolecny, "2026-09-27", -2499, "Alza.cz");
        var after = await NotificationAsync(env, env.Spolecny, "2026-10-02", -99, "Kavárna");

        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-15", -1000, "Nájem", PaymentType.Transfer)], Sep1, Sep30);
        Assert.Equal(1, r.NotInStatement);

        var db = env.FreshDb();
        Assert.True((await db.Transactions.SingleAsync(t => t.Id == inside)).NotInStatement);
        Assert.False((await db.Transactions.SingleAsync(t => t.Id == tail)).NotInStatement);
        Assert.False((await db.Transactions.SingleAsync(t => t.Id == after)).NotInStatement);
        Assert.Equal(Sep30, (await db.Accounts.SingleAsync(a => a.Id == env.Spolecny.Id)).StatementCoveredTo);
        var batch = await db.ImportBatches.SingleAsync(b => b.Id == r.BatchId);
        Assert.Equal((Sep1, Sep30), (batch.PeriodFrom, batch.PeriodTo));

        // Ve frontě Ke kategorizaci a s vlastním filtrem, hromadné potvrzení ho přeskočí
        var inbox = await env.Get<InboxService>().ListAsync(InboxFilter.NotInStatement, null, null);
        Assert.Equal(inside, Assert.Single(inbox.Items).Tx.Id);
        Assert.Equal(1, inbox.Counts.NotInStatement);
        Assert.True(inbox.Items[0].Tx.Provisional && inbox.Items[0].Tx.NotInStatement);

        // Tail se posoudí až dalším výpisem
        var oct = await StatementAsync(env, env.Spolecny, [Row("2026-10-20", -10, "Poplatek", PaymentType.Fee)], new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31));
        Assert.Equal(2, oct.NotInStatement);
    }

    [Fact]
    public async Task Without_period_the_first_and_last_row_are_used()
    {
        using var env = new TestEnv();
        await NotificationAsync(env, env.Spolecny, "2026-09-03", -50, "Pekárna");
        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-01", -10, "A"), Row("2026-09-20", -20, "B")]);
        Assert.Equal(1, r.NotInStatement);
        Assert.Equal(new DateOnly(2026, 9, 20), (await env.FreshDb().Accounts.SingleAsync(a => a.Id == env.Spolecny.Id)).StatementCoveredTo);
    }

    [Fact]
    public async Task Not_in_statement_can_be_kept_or_deleted()
    {
        using var env = new TestEnv();
        var keep = await NotificationAsync(env, env.Spolecny, "2026-09-05", -500, "Rohlik.cz");
        var drop = await NotificationAsync(env, env.Spolecny, "2026-09-06", -300, "Benzina");
        await StatementAsync(env, env.Spolecny, [Row("2026-09-15", -1000, "Nájem", PaymentType.Transfer)], Sep1, Sep30);

        var txs = env.Get<TransactionService>();
        await txs.ResolveNotInStatementAsync(keep, keep: true, "Vašek");
        await txs.ResolveNotInStatementAsync(drop, keep: false, "Vašek");
        var db = env.FreshDb();
        var kept = await db.Transactions.SingleAsync(t => t.Id == keep);
        Assert.False(kept.Provisional || kept.NotInStatement);
        Assert.False(await db.Transactions.AnyAsync(t => t.Id == drop));
        await Assert.ThrowsAsync<DomainException>(() => txs.ResolveNotInStatementAsync(keep, keep: false, "Vašek"));
    }

    [Fact]
    public async Task Reimporting_the_statement_creates_nothing()
    {
        using var env = new TestEnv();
        await NotificationAsync(env, env.Spolecny, "2026-09-22", -349, "ALBERT 0712 BRNO");
        var rows = new[] { Row("2026-09-24", -349, "Albert Brno"), Row("2026-09-25", -100, "Lidl") };
        await StatementAsync(env, env.Spolecny, rows, Sep1, Sep30);
        var again = await StatementAsync(env, env.Spolecny, rows, Sep1, Sep30);
        Assert.Equal((0, 0, 2), (again.Created, again.Reconciled, again.SkippedDuplicates));
        Assert.Equal(2, await env.FreshDb().Transactions.CountAsync(t => t.AccountId == env.Spolecny.Id));
    }

    [Fact]
    public async Task Statement_in_two_parts_clears_early_flag()
    {
        using var env = new TestEnv();
        var id = await NotificationAsync(env, env.Spolecny, "2026-09-12", -800, "IKEA");
        var first = await StatementAsync(env, env.Spolecny, [Row("2026-09-02", -10, "A")], Sep1, Sep30);
        Assert.Equal(1, first.NotInStatement); // v první části výpisu není
        var second = await StatementAsync(env, env.Spolecny, [Row("2026-09-16", -800, "IKEA Brno")], Sep1, Sep30, first.BatchId);
        Assert.Equal(1, second.Reconciled);
        var t = await env.FreshDb().Transactions.SingleAsync(x => x.Id == id);
        Assert.False(t.Provisional || t.NotInStatement);
    }

    [Fact]
    public async Task Two_identical_payments_are_both_reconciled()
    {
        using var env = new TestEnv();
        await NotificationAsync(env, env.Spolecny, "2026-09-10", -89, "Kavárna");
        await NotificationAsync(env, env.Spolecny, "2026-09-10", -89, "Kavárna");
        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-11", -89, "Kavárna"), Row("2026-09-11", -89, "Kavárna")], Sep1, Sep30);
        Assert.Equal((2, 0), (r.Reconciled, r.Created));
        Assert.Equal(2, await env.FreshDb().Transactions.CountAsync(t => t.AccountId == env.Spolecny.Id && !t.Provisional));
    }

    [Fact]
    public async Task Statement_row_without_notification_is_still_imported_once()
    {
        using var env = new TestEnv();
        await NotificationAsync(env, env.Spolecny, "2026-09-10", -89, "Kavárna");
        var r = await StatementAsync(env, env.Spolecny, [Row("2026-09-10", -89, "Kavárna"), Row("2026-09-10", -89, "Kavárna")], Sep1, Sep30);
        Assert.Equal((1, 1, 0), (r.Reconciled, r.Created, r.SkippedDuplicates));
    }

    [Fact]
    public async Task Notifications_and_manual_entries_do_not_reconcile_or_flag()
    {
        using var env = new TestEnv();
        var id = await NotificationAsync(env, env.Spolecny, "2026-09-05", -500, "Rohlik.cz");
        var again = await env.Get<ImportService>().ImportAsync(env.Spolecny.Id, [Row("2026-09-05", -500, "Rohlik.cz")],
            new ImportOptions(BatchSource.Email, "E-mail z banky"));
        Assert.Equal((0, 1, 1), (again.Reconciled, again.Created, again.SuspectedDuplicates));

        var manual = await env.Get<ImportService>().ImportAsync(env.Spolecny.Id, [Row("2026-09-20", -10, "Trafika", PaymentType.Cash)],
            new ImportOptions(BatchSource.Manual, "Vašek"));
        Assert.Equal(0, manual.NotInStatement);
        var t = await env.FreshDb().Transactions.SingleAsync(x => x.Id == id);
        Assert.True(t.Provisional);
        Assert.False(t.NotInStatement);
    }

    [Fact]
    public async Task Invalid_period_is_rejected()
    {
        using var env = new TestEnv();
        await Assert.ThrowsAsync<DomainException>(() => StatementAsync(env, env.Spolecny, [Row("2026-09-05", -1, "X")], Sep30, Sep1));
    }

    private static StatementMatcher.Candidate C(int id, string date, decimal amount, string cp, PaymentType type = PaymentType.Card) =>
        new(id, DateOnly.Parse(date), amount, cp, type);

    [Fact]
    public void Matcher_prefers_same_amount_similar_counterparty_and_closer_date()
    {
        var row = Row("2026-09-10", -100, "Lidl Brno");
        Assert.Equal(2, StatementMatcher.Match(row, [C(1, "2026-09-09", -100, "Kavárna"), C(2, "2026-09-08", -100, "LIDL 123")]));
        Assert.Equal(3, StatementMatcher.Match(row, [C(1, "2026-09-03", -100, "Kavárna"), C(3, "2026-09-09", -100, "Kavárna")]));
        Assert.Null(StatementMatcher.Match(row, [C(1, "2026-09-02", -100, "Lidl")]));   // mimo okno 7 dní
        Assert.Null(StatementMatcher.Match(row, [C(1, "2026-09-10", 100, "Lidl")]));    // opačný směr
        Assert.Null(StatementMatcher.Match(row, [C(1, "2026-09-10", -104, "Lidl")]));   // nad 3 %
        Assert.Equal(1, StatementMatcher.Match(row, [C(1, "2026-09-10", -102, "Lidl")]));
        Assert.Null(StatementMatcher.Match(Row("2026-09-10", -100, "Nájem", PaymentType.Transfer),
            [C(1, "2026-09-10", -101, "Nájem", PaymentType.Transfer)]));                  // tolerance jen u karet
    }

    [Theory]
    [InlineData("2026-09-05", true)]
    [InlineData("2026-08-26", true)]
    [InlineData("2026-08-24", false)]
    [InlineData("2026-09-23", true)]
    [InlineData("2026-09-24", false)]
    [InlineData("2026-10-02", false)]
    public void Missing_window(string date, bool expected) => Assert.Equal(expected, StatementMatcher.IsMissing(DateOnly.Parse(date), Sep1, Sep30));
}

using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class ImportTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Fact]
    public async Task Import_creates_batch_with_unconfirmed_transactions_and_shares()
    {
        var res = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-20", -1000, "Albert"), TestEnv.Tx("2026-09-21", 500, "Vratka"));
        Assert.Equal(2, res.Created);
        var txs = await _env.FreshDb().Transactions.Include(t => t.Shares).Where(t => t.BatchId == res.BatchId).ToListAsync();
        Assert.All(txs, t => Assert.Equal(TransactionStatus.Suggested, t.Status));
        var albert = txs.Single(t => t.Counterparty == "Albert");
        Assert.Equal(TransactionKind.Expense, albert.Kind);
        Assert.Equal(70, albert.Shares.Single(s => s.MemberId == _env.Vasek.Id).Percent);
        Assert.Equal(30, albert.Shares.Single(s => s.MemberId == _env.Misa.Id).Percent);
        var batch = await _env.FreshDb().ImportBatches.FindAsync(res.BatchId);
        Assert.Equal(BatchState.Uploaded, batch!.State);
    }

    [Fact]
    public async Task Reimport_of_same_statement_skips_exact_duplicates_but_keeps_legit_repeats()
    {
        var items = new[] { TestEnv.Tx("2026-09-20", -65, "Kavárna"), TestEnv.Tx("2026-09-20", -65, "Kavárna"), TestEnv.Tx("2026-09-21", -300, "Lidl") };
        var first = await _env.ImportAsync(_env.Bezny, items);
        Assert.Equal(3, first.Created); // dvě kávy ve stejný den jsou dvě platby

        var again = await _env.ImportAsync(_env.Bezny, [.. items, TestEnv.Tx("2026-09-22", -65, "Kavárna")]);
        Assert.Equal(1, again.Created);
        Assert.Equal(3, again.SkippedDuplicates);
        var batch = await _env.FreshDb().ImportBatches.Include(b => b.SkippedDuplicates).FirstAsync(b => b.Id == again.BatchId);
        Assert.Equal(3, batch.SkippedDuplicates.Count);
    }

    [Fact]
    public async Task External_id_identifies_duplicate_even_with_different_text()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -120, "DM drogerie", externalId: "abc"));
        var res = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -120, "dm drogerie markt s.r.o.", externalId: "abc"));
        Assert.Equal(0, res.Created);
        Assert.Equal(1, res.SkippedDuplicates);
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(3, 1)]
    [InlineData(7, 1)]
    public async Task Similar_payment_within_window_is_suspected_duplicate(int window, int expected)
    {
        var h = await _env.Db.Households.FirstAsync();
        h.Settings.DedupWindowDays = window;
        await _env.Db.SaveChangesAsync();
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -1124, "Lidl Praha"));
        var res = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-23", -1124, "LIDL"));
        Assert.Equal(1, res.Created);
        Assert.Equal(expected, res.SuspectedDuplicates);
    }

    [Fact]
    public async Task Transfer_between_own_accounts_is_paired_and_excluded()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -15000, "Příspěvek na společný", counterAccount: "2900111222/2010"));
        var res = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-16", 15000, "Novák Václav", counterAccount: "123-4567890/0800"));
        Assert.Equal(1, res.Transfers);
        var txs = await _env.FreshDb().Transactions.OrderBy(t => t.Id).ToListAsync();
        Assert.All(txs, t => Assert.Equal(TransactionKind.Transfer, t.Kind));
        Assert.Equal(txs[1].Id, txs[0].TransferPairId);
        Assert.Equal(txs[0].Id, txs[1].TransferPairId);
        Assert.All(txs, t => Assert.Equal(TransactionStatus.Confirmed, t.Status));
    }

    [Fact]
    public async Task Outgoing_to_own_account_without_counterpart_is_unpaired_transfer()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -2000, "Na spoření", counterAccount: "CZ62 0800 0000 0009 8765 4321"));
        var t = await _env.FreshDb().Transactions.SingleAsync();
        Assert.Equal(TransactionKind.Transfer, t.Kind);
        Assert.Null(t.TransferPairId);
    }

    [Fact]
    public async Task Foreign_currency_transfer_pairs_within_tolerance()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-26", -12310, "Nákup EUR", counterAccount: "2900333444/2010"));
        var res = await _env.ImportAsync(_env.Eurovy, TestEnv.Tx("2026-09-27", 500, "Novák Václav")); // 500 € ≈ 12 190 Kč
        Assert.Equal(1, res.Transfers);
        Assert.All(await _env.FreshDb().Transactions.ToListAsync(), t => Assert.NotNull(t.TransferPairId));
    }

    [Fact]
    public async Task Same_amount_without_proof_of_flow_is_not_a_transfer()
    {
        // Jediný protějšek se stejnou částkou, ale nic nedokládá, že peníze tekly mezi těmito účty
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -3000, "Nákup"));
        var res = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-16", 3000, "Vrácení zálohy"));
        Assert.Equal(0, res.Transfers);
        var txs = await _env.FreshDb().Transactions.OrderBy(t => t.Id).ToListAsync();
        Assert.Equal([TransactionKind.Expense, TransactionKind.Income], txs.Select(t => t.Kind));
        Assert.All(txs, t => Assert.Null(t.TransferPairId));
    }

    [Fact]
    public async Task Incoming_from_foreign_account_is_not_paired_with_own_outgoing_of_same_amount()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -4000, "Nájem", counterAccount: "1111222233/0100"));
        var res = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-16", 4000, "Jan Cizí", counterAccount: "5555666677/0300"));
        Assert.Equal(0, res.Transfers);
        Assert.All(await _env.FreshDb().Transactions.ToListAsync(), t => Assert.Null(t.TransferPairId));
    }

    [Fact]
    public async Task Known_counterparty_that_is_not_the_other_account_blocks_pairing()
    {
        // Běžný posílá na Společný, ale na Společný ve stejnou dobu přišla stejná částka od někoho cizího
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -4000, "Na společný", counterAccount: "2900111222/2010"));
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-16", 4000, "Jan Cizí", counterAccount: "5555666677/0300"));
        var txs = await _env.FreshDb().Transactions.OrderBy(t => t.Id).ToListAsync();
        Assert.Equal(TransactionKind.Transfer, txs[0].Kind); // protiúčet je vlastní účet → převod, ale bez páru
        Assert.Equal(TransactionKind.Income, txs[1].Kind);
        Assert.All(txs, t => Assert.Null(t.TransferPairId));
    }

    [Fact]
    public async Task Deposit_to_investment_account_from_its_funding_account_is_paired()
    {
        var broker = await _env.Get<AccountService>().CreateAsync(new AccountInput(AccountKind.Investment, "xtb", "ETF", "XTB-1", Joint: true,
            Ratio: new() { [_env.Vasek.Id] = 100 }, InvestmentKind: InvestmentKind.Etf, FundingAccountId: _env.Bezny.Id,
            OpeningDate: new DateOnly(2026, 1, 1)));
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", -8000, "XTB", counterAccount: "2345678901/2700")); // sběrný účet brokera
        var res = await _env.ImportAsync(broker, TestEnv.Tx("2026-09-11", 8000, "Vklad"));
        Assert.Equal(1, res.Transfers);
        Assert.All(await _env.FreshDb().Transactions.ToListAsync(), t => Assert.Equal(TransactionKind.InvestmentTransfer, t.Kind));
    }

    [Fact]
    public async Task Currency_mismatch_is_rejected()
    {
        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            _env.Get<ImportService>().ImportAsync(_env.Bezny.Id, [new ImportItem(TestEnv.Today, -10, "X", Currency: "EUR")],
                new ImportOptions(BatchSource.Mcp, "Test")));
        Assert.Contains("v měně účtu", ex.Message);
    }

    [Fact]
    public async Task Rules_categorize_on_import_and_batch_becomes_categorized()
    {
        await _env.Get<RuleService>().CreateAsync(new RuleInput([new ConditionDto2(RuleField.Merchant, RuleOp.Contains, "albert")], RuleLogic.And, _env.Cat("Supermarkety")));
        var res = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -1000, "ALBERT HM"));
        Assert.Equal(1, res.CategorizedByRule);
        var t = await _env.FreshDb().Transactions.SingleAsync();
        Assert.Equal(_env.Cat("Supermarkety"), t.CategoryId);
        Assert.Equal(CategorySource.Rule, t.CategorySource);
        Assert.Equal(TransactionStatus.Suggested, t.Status);
        Assert.Equal(BatchState.Categorized, (await _env.FreshDb().ImportBatches.FindAsync(res.BatchId))!.State);
    }

    [Fact]
    public async Task Ai_suggestion_auto_confirms_above_threshold_only()
    {
        var res = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -1850, "Benzina"), TestEnv.Tx("2026-09-21", -7244, "Alza.cz"));
        var ids = res.TransactionIds;
        var r = await _env.Get<TransactionService>().SuggestAsync(
        [
            new AiSuggestion(ids[0], _env.Cat("Palivo"), null, 93, "Čerpací stanice", null),
            new AiSuggestion(ids[1], _env.Cat("Elektronika"), null, 62, "Alza prodává hlavně elektroniku",
                [new AiAlternative(_env.Cat("Vybavení domácnosti"), 21)]),
        ], "Claude");
        Assert.Equal(2, r.Applied);
        Assert.Equal(1, r.AutoConfirmed);
        var db = _env.FreshDb();
        Assert.Equal(TransactionStatus.Confirmed, (await db.Transactions.FindAsync(ids[0]))!.Status);
        var alza = (await db.Transactions.FindAsync(ids[1]))!;
        Assert.Equal(TransactionStatus.Suggested, alza.Status);
        Assert.Equal(62, alza.AiConfidence);
        Assert.Contains("Vybavení", string.Join(",", TransactionService.ParseAlternatives(alza.AiAlternatives).Select(a => _env.Db.Categories.Find(a.CategoryId)!.Name)));

        // Ruční zařazení AI už nepřepíše
        await _env.Get<TransactionService>().UpdateAsync(ids[1], new TxUpdate(CategoryId: _env.Cat("Dárky"), SetCategory: true), "Vašek");
        var again = await _env.Get<TransactionService>().SuggestAsync([new AiSuggestion(ids[1], _env.Cat("Elektronika"), null, 99, null, null)], "Claude");
        Assert.Equal(0, again.Applied);
        Assert.Single(again.Skipped);
    }

    [Fact]
    public async Task Split_must_sum_to_amount_with_same_sign()
    {
        var res = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -3486, "Albert"));
        var svc = _env.Get<TransactionService>();
        await Assert.ThrowsAsync<DomainException>(() => svc.UpdateAsync(res.TransactionIds[0],
            new TxUpdate(Splits: [new SplitInput(_env.Cat("Supermarkety"), -2440), new SplitInput(_env.Cat("Elektronika"), -1000)]), "V"));
        var row = await svc.UpdateAsync(res.TransactionIds[0],
            new TxUpdate(Splits: [new SplitInput(_env.Cat("Supermarkety"), -2440), new SplitInput(_env.Cat("Elektronika"), -1046)]), "V");
        Assert.Equal(2, row.Splits.Count);
        Assert.Null(row.CategoryId);
    }

    [Fact]
    public async Task Manual_categorization_with_rule_creation_applies_to_older_payments()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-08-10", -500, "ROHLIK.CZ objednavka 1"), TestEnv.Tx("2026-09-10", -700, "ROHLIK.CZ objednavka 2"));
        var third = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -900, "ROHLIK.CZ objednavka 3"));
        await _env.Get<TransactionService>().UpdateAsync(third.TransactionIds[0],
            new TxUpdate(CategoryId: _env.Cat("Supermarkety"), SetCategory: true, Confirm: true, CreateRule: true), "Vašek");
        var db = _env.FreshDb();
        var rule = await db.Rules.Include(r => r.Conditions).SingleAsync();
        Assert.Equal(RuleSource.Inbox, rule.Source);
        Assert.Equal("ROHLIK.CZ OBJEDNAVKA", rule.Conditions.Single().Value);
        Assert.All(await db.Transactions.ToListAsync(), t => Assert.Equal(_env.Cat("Supermarkety"), t.CategoryId));
    }
}

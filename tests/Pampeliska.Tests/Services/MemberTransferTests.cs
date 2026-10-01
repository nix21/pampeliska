using Microsoft.EntityFrameworkCore;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

/// <summary>Převody mezi účty dvou členů: v pohledu člena se počítají, v pohledu domácnosti ne.</summary>
public class MemberTransferTests : IDisposable
{
    private const string BeznyIban = "123-4567890/0800";
    private const string MisinIban = "555666777/0800";
    private readonly TestEnv _env = new();
    private readonly Account _misin;

    public MemberTransferTests()
    {
        _misin = _env.Get<AccountService>().CreateAsync(new AccountInput(AccountKind.Current, "cs", "Míšin účet", MisinIban,
            OwnerMemberId: _env.Misa.Id, OpeningDate: new DateOnly(2026, 1, 1))).GetAwaiter().GetResult();
    }

    public void Dispose() => _env.Dispose();

    private static readonly DateRange September = DateRange.Month(2026, 9);
    private StatsService Stats => _env.Get<StatsService>();
    private Task<OverviewStats> Overview(int? member) => Stats.OverviewAsync(new StatsFilter(September, member), false);
    private static decimal Of(OverviewStats o, int? categoryId) => o.ByCategory.SingleOrDefault(c => c.CategoryId == categoryId)?.Amount ?? 0;

    /// <summary>Míša pošle Vaškovi z vlastního účtu na jeho vlastní.</summary>
    private async Task<(int Misa, int Vasek)> MisaSendsVasekAsync(decimal amount, string date = "2026-09-12")
    {
        var m = await _env.ImportAsync(_misin, TestEnv.Tx(date, -amount, "Vašek", counterAccount: BeznyIban));
        var v = await _env.ImportAsync(_env.Bezny, TestEnv.Tx(date, amount, "Míša", counterAccount: MisinIban));
        return (m.TransactionIds[0], v.TransactionIds[0]);
    }

    [Fact]
    public async Task Settlement_of_shared_holiday_splits_expense_between_members()
    {
        var tx = _env.Get<TransactionService>();
        var dovolena = _env.Cat("Dovolená");
        var trip = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-05", -5000, "Invia"));
        await tx.UpdateAsync(trip.TransactionIds[0], new TxUpdate(CategoryId: dovolena, SetCategory: true), "V");
        var (misa, vasek) = await MisaSendsVasekAsync(2500);

        var pair = await _env.FreshDb().Transactions.Where(t => t.Id == misa || t.Id == vasek).ToListAsync();
        Assert.All(pair, t =>
        {
            Assert.Equal(TransactionKind.Transfer, t.Kind);
            Assert.True(t.BetweenMembers);
            Assert.Equal(TransactionStatus.Suggested, t.Status);
        });

        // Míša zařadí svou stranu, Vaškova strana dostane stejnou kategorii jako návrh
        await tx.UpdateAsync(misa, new TxUpdate(CategoryId: dovolena, SetCategory: true, Confirm: true), "M");
        var vasekSide = await _env.FreshDb().Transactions.FindAsync(vasek);
        Assert.Equal(dovolena, vasekSide!.CategoryId);
        Assert.Equal(CategorySource.Auto, vasekSide.CategorySource);
        Assert.Equal(TransactionStatus.Suggested, vasekSide.Status);

        var household = await Overview(null);
        Assert.Equal(5000, household.Expense);
        Assert.Equal(0, household.Income);
        Assert.Equal(5000, Of(household, dovolena));
        Assert.Equal(2500, Of(await Overview(_env.Vasek.Id), dovolena));
        Assert.Equal(2500, Of(await Overview(_env.Misa.Id), dovolena));
    }

    [Fact]
    public async Task Uncategorized_member_transfer_counts_as_uncategorized_expense_and_income()
    {
        var (misa, vasek) = await MisaSendsVasekAsync(1000);

        var household = await Overview(null);
        Assert.Equal(0, household.Expense);
        Assert.Equal(0, household.Income);

        var m = await Overview(_env.Misa.Id);
        Assert.Equal(1000, m.Expense);
        Assert.Equal(1000, Of(m, null));
        var v = await Overview(_env.Vasek.Id);
        Assert.Equal(1000, v.Income);
        Assert.Equal(0, v.Expense);

        var inbox = await _env.Get<InboxService>().ListAsync(InboxFilter.All, null, null);
        Assert.Equal([misa, vasek], inbox.Items.Select(i => i.Tx.Id).Order());
        Assert.All(inbox.Items, i => Assert.True(i.Tx.BetweenMembers));

        var summary = await Stats.SummaryAsync(September, null, _env.Misa.Id);
        Assert.Equal(1000, summary.Expense);
        Assert.Equal(0, summary.Transfers);
        Assert.Equal(2, (await Stats.SummaryAsync(September, null, null)).Transfers); // v domácnosti jen převody
    }

    [Fact]
    public async Task Member_transfer_is_listed_among_expenses_only_for_that_member()
    {
        var (misa, _) = await MisaSendsVasekAsync(1000);
        var tx = _env.Get<TransactionService>();
        var misaExpenses = await tx.ListAsync(new TxFilter(September, MemberId: _env.Misa.Id, Kind: KindFilter.Expense));
        Assert.Equal([misa], misaExpenses.Items.Select(i => i.Id));
        Assert.Empty((await tx.ListAsync(new TxFilter(September, MemberId: _env.Vasek.Id, Kind: KindFilter.Expense))).Items);
        Assert.Empty((await tx.ListAsync(new TxFilter(September, Kind: KindFilter.Expense))).Items);
    }

    [Fact]
    public async Task Transfers_with_joint_account_or_within_one_member_stay_hidden()
    {
        await _env.ImportAsync(_misin, TestEnv.Tx("2026-09-10", -3000, "Na společný", counterAccount: "2900111222/2010"));
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-10", 3000, "Míša", counterAccount: MisinIban));
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-11", -2000, "Na eurový", counterAccount: "2900333444/2010"));

        var txs = await _env.FreshDb().Transactions.ToListAsync();
        Assert.All(txs, t =>
        {
            Assert.Equal(TransactionKind.Transfer, t.Kind);
            Assert.False(t.BetweenMembers);
            Assert.Equal(TransactionStatus.Confirmed, t.Status);
        });
        foreach (int? member in new int?[] { null, _env.Vasek.Id, _env.Misa.Id })
        {
            var o = await Overview(member);
            Assert.Equal(0, o.Expense);
            Assert.Equal(0, o.Income);
        }
        await Assert.ThrowsAsync<DomainException>(() =>
            _env.Get<TransactionService>().UpdateAsync(txs[0].Id, new TxUpdate(CategoryId: _env.Cat("Dovolená"), SetCategory: true), "M"));
    }

    [Fact]
    public async Task Manually_categorized_incoming_payment_is_paired_as_member_transfer_and_keeps_category()
    {
        var dovolena = _env.Cat("Dovolená");
        var income = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-12", 2500, "Míša")); // bez protiúčtu → příjem
        await _env.Get<TransactionService>().UpdateAsync(income.TransactionIds[0], new TxUpdate(CategoryId: dovolena, SetCategory: true), "V");

        var res = await _env.ImportAsync(_misin, TestEnv.Tx("2026-09-12", -2500, "Vašek", counterAccount: BeznyIban));
        Assert.Equal(1, res.Transfers);
        var txs = await _env.FreshDb().Transactions.OrderBy(t => t.Id).ToListAsync();
        Assert.All(txs, t =>
        {
            Assert.True(t.BetweenMembers);
            Assert.Equal(dovolena, t.CategoryId);
        });
        Assert.Equal(CategorySource.Manual, txs[0].CategorySource);
        Assert.Equal(CategorySource.Auto, txs[1].CategorySource);
        Assert.Equal(0, (await Overview(null)).Income);
    }

    [Fact]
    public async Task Unpairing_or_making_account_joint_ends_member_transfer()
    {
        var (misa, vasek) = await MisaSendsVasekAsync(1000);
        await _env.Get<TransactionService>().UpdateAsync(misa, new TxUpdate(CategoryId: _env.Cat("Dárky"), SetCategory: true), "M");

        await _env.Get<AccountService>().UpdateAsync(_misin.Id, new AccountInput(Joint: true));
        var txs = await _env.FreshDb().Transactions.Where(t => t.Id == misa || t.Id == vasek).ToListAsync();
        Assert.All(txs, t =>
        {
            Assert.False(t.BetweenMembers);
            Assert.Null(t.CategoryId);
            Assert.Equal(TransactionStatus.Confirmed, t.Status);
        });

        await _env.Get<AccountService>().UpdateAsync(_misin.Id, new AccountInput(OwnerMemberId: _env.Misa.Id));
        Assert.True((await _env.FreshDb().Transactions.FindAsync(misa))!.BetweenMembers);

        await _env.Get<TransferMatcher>().UnpairAsync(misa);
        var after = await _env.FreshDb().Transactions.Where(t => t.Id == misa || t.Id == vasek).ToListAsync();
        Assert.All(after, t =>
        {
            Assert.False(t.BetweenMembers);
            Assert.Null(t.TransferAccountId);
            Assert.NotEqual(TransactionKind.Transfer, t.Kind);
        });
    }

    [Fact]
    public async Task Older_transfers_without_counter_account_are_reclassified_at_startup()
    {
        var (misa, vasek) = await MisaSendsVasekAsync(1000);
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -2000, "Na spoření", counterAccount: "987654321/0800"));
        var db = _env.FreshDb();
        foreach (var t in await db.Transactions.ToListAsync())
        {
            // Stav před zavedením převodů mezi členy
            t.TransferAccountId = null;
            t.BetweenMembers = false;
            t.Status = TransactionStatus.Confirmed;
            t.CategorySource = CategorySource.Auto;
        }
        await db.SaveChangesAsync();

        await Pampeliska.Core.Data.Seed.EnsureAsync(_env.FreshDb(), _env.Clock);
        var txs = await _env.FreshDb().Transactions.ToDictionaryAsync(t => t.Id);
        Assert.True(txs[misa].BetweenMembers);
        Assert.Equal(_env.Bezny.Id, txs[misa].TransferAccountId);
        Assert.Equal(TransactionStatus.Suggested, txs[vasek].Status);
        var saving = txs.Values.Single(t => t.Counterparty == "Na spoření");
        Assert.False(saving.BetweenMembers);
        Assert.Equal(_env.Sporici.Id, saving.TransferAccountId);
    }
}

public class TransferFlowTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Fact]
    public async Task Joint_account_flows_split_members_and_external_money()
    {
        var tx = _env.Get<TransactionService>();
        // Vašek převede z běžného na společný (spárovaný převod)
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-03", -5000, "Na společný", counterAccount: "2900111222/2010"));
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-03", 5000, "Vašek", counterAccount: "123-4567890/0800"));
        // Výplata z účtu mimo domácnost jde poměrem → externě
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-10", 3000, "Pracovní účet", counterAccount: "1173399034/3030"));
        // Příspěvek připsaný Míše jde za ní
        var misa = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-12", 2000, "Míša hotově"));
        await tx.UpdateAsync(misa.TransactionIds[0], new TxUpdate(MemberId: _env.Misa.Id, SetMember: true), "V");
        // Příjem na Vaškův vlastní účet do přehledu nepatří
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", 40000, "Mzda"));

        var flows = await _env.Get<StatsService>().TransferFlowsAsync(DateRange.Month(2026, 9), null);
        var joint = Assert.Single(flows);
        Assert.Equal(_env.Spolecny.Id, joint.AccountId);
        Assert.Equal(10000, joint.Total);
        Assert.Equal(5000, joint.Senders.Single(s => s.MemberId == _env.Vasek.Id).Amount);
        Assert.Equal(2000, joint.Senders.Single(s => s.MemberId == _env.Misa.Id).Amount);
        Assert.Equal(3000, joint.Senders.Single(s => s.External).Amount);

        // Proklik ze součtů: seznam pohybů podle zdroje odpovídá panelu
        async Task<decimal> Sum(string from) =>
            (await tx.ListAsync(new TxFilter(DateRange.Month(2026, 9), AccountId: _env.Spolecny.Id, From: from))).Items.Sum(i => i.AmountCzk);
        Assert.Equal(5000, await Sum($"m{_env.Vasek.Id}"));
        Assert.Equal(2000, await Sum($"m{_env.Misa.Id}"));
        Assert.Equal(3000, await Sum("ext"));
        Assert.Equal(10000, await Sum("all"));
        await Assert.ThrowsAsync<DomainException>(() => tx.ListAsync(new TxFilter(From: "x")));
    }
}

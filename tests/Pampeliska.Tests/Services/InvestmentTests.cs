using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class InvestmentTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Fact]
    public async Task Manual_deposits_with_value_replace_opening_and_later_transfers_add_up()
    {
        var broker = await _env.Get<AccountService>().CreateAsync(new AccountInput(AccountKind.Investment, "othb", "Portu", "PORTU-1",
            OwnerMemberId: _env.Vasek.Id, InvestmentKind: InvestmentKind.Etf, OpeningBalance: 10_000, OpeningDeposits: 9_000, OpeningDate: new DateOnly(2026, 1, 1)));
        // Převody před ručním zadáním se už nezapočítají, po něm ano
        await _env.ImportAsync(broker, TestEnv.Tx("2026-09-05", 3_000, "Vklad", counterAccount: "123-4567890/0800"),
            TestEnv.Tx("2026-09-20", 2_000, "Vklad", counterAccount: "123-4567890/0800"));
        var inv = _env.Get<InvestmentService>();
        await inv.AddValueAsync(broker.Id, new DateOnly(2026, 8, 31), 20_000);
        await inv.AddValueAsync(broker.Id, new DateOnly(2026, 9, 10), 30_000, 25_000);

        var view = (await inv.AccountsAsync()).Single(v => v.AccountId == broker.Id);
        Assert.Equal(9_000, view.History.Single(h => h.Date == new DateOnly(2026, 8, 31)).Deposits);
        Assert.Equal(25_000, view.History.Single(h => h.Date == new DateOnly(2026, 9, 10)).Deposits);
        Assert.Equal(27_000, view.Deposits);
        Assert.Equal(3_000, view.Gain);

        // Nová hodnota ve stejný den bez vkladů ručně zadané vklady nesmaže
        await inv.AddValueAsync(broker.Id, new DateOnly(2026, 9, 10), 31_000);
        Assert.Equal(25_000, (await _env.FreshDb().InvestmentValues.SingleAsync(v => v.Date == new DateOnly(2026, 9, 10))).Deposits);
    }

    [Fact]
    public async Task Current_account_with_transactions_can_become_savings_but_not_investment()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -100, "Albert"));
        var accounts = _env.Get<AccountService>();
        await accounts.UpdateAsync(_env.Bezny.Id, new AccountInput(AccountKind.Savings));
        Assert.Equal(AccountKind.Savings, (await _env.FreshDb().Accounts.FindAsync(_env.Bezny.Id))!.Kind);
        await Assert.ThrowsAsync<DomainException>(() => accounts.UpdateAsync(_env.Bezny.Id, new AccountInput(AccountKind.Investment)));
    }
}

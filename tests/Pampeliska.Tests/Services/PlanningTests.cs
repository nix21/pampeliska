using Microsoft.EntityFrameworkCore;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class StatsTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Fact]
    public async Task Refunds_reduce_expense_transfers_and_excluded_are_ignored_splits_count_by_part()
    {
        var tx = _env.Get<TransactionService>();
        var alza = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-05", -7244, "Alza.cz"));
        await tx.UpdateAsync(alza.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Elektronika"), SetCategory: true), "V");
        var refund = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", 499, "Alza.cz vratka"));
        await tx.UpdateAsync(refund.TransactionIds[0], new TxUpdate(RefundOfId: alza.TransactionIds[0], SetRefundOf: true), "V");
        var albert = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-12", -3486, "Albert"));
        await tx.UpdateAsync(albert.TransactionIds[0], new TxUpdate(Splits: [new SplitInput(_env.Cat("Supermarkety"), -2440), new SplitInput(_env.Cat("Elektronika"), -1046)]), "V");
        var gift = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-13", -5000, "Převod rodičům"));
        await tx.UpdateAsync(gift.TransactionIds[0], new TxUpdate(ExcludeFromStats: true), "V");
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-15", -2000, "Na spoření", counterAccount: "987654321/0800"));
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", 68880, "Mzda Škoda Auto"));

        var o = await _env.Get<StatsService>().OverviewAsync(new StatsFilter(DateRange.Month(2026, 9)), compare: false);
        Assert.Equal(7244 - 499 + 3486, o.Expense);
        Assert.Equal(68880, o.Income);
        var elektronika = o.ByCategory.Single(c => c.CategoryId == _env.Cat("Elektronika"));
        Assert.Equal(7244 - 499 + 1046, elektronika.Amount);
        var parent = o.ByCategory.Single(c => c.CategoryId == _env.Cat("Elektronika a domácnost"));
        Assert.Equal(elektronika.Amount, parent.Amount);
    }

    [Fact]
    public async Task Income_in_expense_category_reduces_expense_and_is_listed_among_expenses()
    {
        var tx = _env.Get<TransactionService>();
        var rent = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-05", -41283, "Nájem"));
        await tx.UpdateAsync(rent.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Elektronika"), SetCategory: true), "V");
        var share = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-06", 10000, "Míša podíl"));
        await tx.UpdateAsync(share.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Elektronika"), SetCategory: true), "V");
        var salary = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", 68880, "Mzda Škoda Auto"));
        await tx.UpdateAsync(salary.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Mzda"), SetCategory: true), "V");

        var o = await _env.Get<StatsService>().OverviewAsync(new StatsFilter(DateRange.Month(2026, 9)), compare: false);
        Assert.Equal(31283, o.Expense);

        var september = DateRange.Month(2026, 9);
        var expenses = await tx.ListAsync(new TxFilter(september, Kind: KindFilter.Expense));
        Assert.Equal([rent.TransactionIds[0], share.TransactionIds[0]], expenses.Items.Select(i => i.Id).Order());
        var byCategory = await tx.ListAsync(new TxFilter(september, Kind: KindFilter.Expense, CategoryId: _env.Cat("Elektronika a domácnost")));
        Assert.Equal(2, byCategory.Total);
        var income = await tx.ListAsync(new TxFilter(september, Kind: KindFilter.Income));
        Assert.Equal([salary.TransactionIds[0]], income.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Income_tree_breaks_months_down_by_income_categories()
    {
        var tx = _env.Get<TransactionService>();
        var salary = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", 68880, "Mzda Škoda Auto"));
        await tx.UpdateAsync(salary.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Mzda"), SetCategory: true), "V");
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-08-12", 1500, "Neznámý příjem"));
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-12", -3486, "Albert"));

        var tree = await _env.Get<StatsService>().ExpensesAsync(new StatsFilter(DateRange.Parse("2026-Q3")), compare: false, CategoryKind.Income);
        Assert.Equal(68880 + 1500, tree.Total);
        var mzda = _env.Cat("Mzda");
        Assert.Equal(68880, tree.Categories.Single(c => c.CategoryId == mzda).Amount);
        var aug = tree.Months.Single(m => m.Month == "2026-08");
        var sep = tree.Months.Single(m => m.Month == "2026-09");
        Assert.Equal(1500, aug.ByTopCategory[0]);
        Assert.Equal(68880, sep.ByTopCategory.Values.Sum());
        Assert.DoesNotContain(0, sep.ByTopCategory.Keys);
    }

    [Fact]
    public async Task Excluded_category_is_ignored_including_split_parts_and_subcategories()
    {
        var tx = _env.Get<TransactionService>();
        var categories = _env.Get<CategoryService>();
        var parent = await categories.CreateAsync(new CategoryInput("Pronájem", CategoryKind.Income));
        var rent = await categories.CreateAsync(new CategoryInput("Nájem", ParentId: parent.Id));
        var deposit = await categories.CreateAsync(new CategoryInput("Kauce", ParentId: parent.Id));
        await categories.UpdateAsync(deposit.Id, new CategoryInput(ExcludeFromStats: true));
        var cash = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-05", 45000, "Vklad hotovosti"));
        await tx.UpdateAsync(cash.TransactionIds[0], new TxUpdate(Splits: [new SplitInput(deposit.Id, 30000), new SplitInput(rent.Id, 15000)]), "V");
        var loan = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-06", 110000, "Firma s.r.o."));
        await tx.UpdateAsync(loan.TransactionIds[0], new TxUpdate(CategoryId: deposit.Id, SetCategory: true), "V");

        var stats = _env.Get<StatsService>();
        var o = await stats.OverviewAsync(new StatsFilter(DateRange.Month(2026, 9)), compare: false);
        Assert.Equal(15000, o.Income);
        var summary = await stats.SummaryAsync(DateRange.Month(2026, 9), null, null);
        Assert.Equal(15000, summary.Income);
        Assert.Equal(1, summary.Excluded); // celá půjčka; vklad se započítává částí nájmu

        // Vyřazení hlavní kategorie se dědí na podkategorie
        await categories.UpdateAsync(deposit.Id, new CategoryInput(ExcludeFromStats: false));
        await categories.UpdateAsync(parent.Id, new CategoryInput(ExcludeFromStats: true));
        Assert.Equal(0, (await stats.OverviewAsync(new StatsFilter(DateRange.Month(2026, 9)), compare: false)).Income);
        var excluded = await tx.ListAsync(new TxFilter(Excluded: true));
        Assert.Equal(2, excluded.Total);
    }

    [Fact]
    public async Task Member_filter_uses_shares_of_joint_account()
    {
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-05", -1000, "Albert"));
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-06", -200, "Kavárna"));
        var stats = _env.Get<StatsService>();
        Assert.Equal(700 + 200, (await stats.OverviewAsync(new StatsFilter(DateRange.Month(2026, 9), _env.Vasek.Id), false)).Expense);
        Assert.Equal(300, (await stats.OverviewAsync(new StatsFilter(DateRange.Month(2026, 9), _env.Misa.Id), false)).Expense);
    }

    [Fact]
    public async Task Ratio_change_from_date_recalculates_only_later_non_overridden_payments()
    {
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-08-05", -1000, "A"), TestEnv.Tx("2026-09-05", -1000, "B"), TestEnv.Tx("2026-09-06", -1000, "C"));
        var c = await _env.Db.Transactions.FirstAsync(t => t.Counterparty == "C");
        await _env.Get<TransactionService>().UpdateAsync(c.Id, new TxUpdate(MemberId: _env.Misa.Id, SetMember: true), "V");
        await _env.Get<ShareService>().SetRatioAsync(_env.Spolecny.Id, new Dictionary<int, decimal> { [_env.Vasek.Id] = 50, [_env.Misa.Id] = 50 },
            ShareRecalcMode.FromDate, TestEnv.Today, new DateOnly(2026, 9, 1));
        var db = _env.FreshDb();
        var shares = await db.Transactions.Include(t => t.Shares).ToDictionaryAsync(t => t.Counterparty, t => t.Shares.ToDictionary(s => s.MemberId, s => s.Percent));
        Assert.Equal(70, shares["A"][_env.Vasek.Id]);
        Assert.Equal(50, shares["B"][_env.Vasek.Id]);
        Assert.Equal(100, shares["C"][_env.Misa.Id]);
    }
}

public class ConditionTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Fact]
    public async Task Incoming_counts_transfers_only_from_other_institution_and_card_count()
    {
        await _env.Get<AccountService>().UpdateAsync(_env.Bezny.Id, new AccountInput(Conditions:
        [
            new ConditionInput(ConditionType.IncomingSum, 15000, "Vedení zdarma"),
            new ConditionInput(ConditionType.CardCount, 3, null),
        ]));
        await _env.ImportAsync(_env.Sporici, TestEnv.Tx("2026-09-02", -5000, "Převod", counterAccount: "123-4567890/0800"));
        await _env.ImportAsync(_env.Bezny,
            TestEnv.Tx("2026-09-02", 5000, "Ze spořicího", counterAccount: "987654321/0800"),     // ČS → ČS: nepočítá se
            TestEnv.Tx("2026-09-03", 8000, "Z Air Bank", counterAccount: "1234567/3030"),          // cizí banka: počítá se
            TestEnv.Tx("2026-09-04", -100, "Albert", PaymentType.Card),
            TestEnv.Tx("2026-09-05", -100, "Lidl", PaymentType.Card));
        var s = await _env.Get<ConditionService>().EvaluateAsync(_env.Bezny.Id);
        var income = s.Items.Single(i => i.Type == ConditionType.IncomingSum);
        Assert.Equal(8000, income.Current);
        Assert.Equal(ConditionState.Urgent, income.State); // 28. 9. → 2 dny do konce měsíce
        var cards = s.Items.Single(i => i.Type == ConditionType.CardCount);
        Assert.Equal(2, cards.Current);
        Assert.Equal(0, s.Met);
    }

    [Fact]
    public async Task More_than_seven_days_left_is_pending()
    {
        _env.Clock.Now = new DateTimeOffset(2026, 9, 10, 10, 0, 0, TimeSpan.Zero);
        await _env.Get<AccountService>().UpdateAsync(_env.Bezny.Id, new AccountInput(Conditions: [new ConditionInput(ConditionType.CardCount, 1, null)]));
        var s = await _env.Get<ConditionService>().EvaluateAsync(_env.Bezny.Id);
        Assert.Equal(ConditionState.Pending, s.Items.Single().State);
    }
}

public class ForecastAndRecurringTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Fact]
    public void Monthly_schedule_clamps_to_month_end()
    {
        var r = new RecurringPayment { Name = "x", AnchorDate = new DateOnly(2026, 1, 31), Frequency = Frequency.Monthly };
        var occ = RecurringSchedule.Occurrences(r, new DateOnly(2026, 2, 1), new DateOnly(2026, 4, 30)).ToList();
        Assert.Equal([new DateOnly(2026, 2, 28), new DateOnly(2026, 3, 31), new DateOnly(2026, 4, 30)], occ);
    }

    [Fact]
    public async Task Forecast_flags_low_balance_with_top_up_rounded_to_thousands()
    {
        // Běžný: 10 000 + 0 pohybů; hypotéka 18 900 k 1. 10., mzda 30 000 k 10. 10., limit 5 000
        var rec = _env.Get<RecurringService>();
        await rec.CreateAsync(new RecurringInput(_env.Bezny.Id, "Hypotéka", "HYPOTEKA", Amount: -8900, AnchorDate: new DateOnly(2026, 9, 1)), RecurringSource.Manual);
        await rec.CreateAsync(new RecurringInput(_env.Bezny.Id, "Mzda", "MZDA", Amount: 30000, AnchorDate: new DateOnly(2026, 9, 10)), RecurringSource.Manual);
        var f = (await _env.Get<ForecastService>().ForecastAsync(30, _env.Bezny.Id)).Single();
        Assert.Equal(1100, f.Min);
        Assert.True(f.Low);
        Assert.Equal(4000, f.TopUp);
        Assert.Equal(new DateOnly(2026, 10, 1), f.TopUpBy);
        var payday = await _env.Get<ForecastService>().UntilPaydayAsync();
        Assert.Equal(new DateOnly(2026, 10, 10), payday.Payday);
    }

    [Fact]
    public async Task Detection_suggests_monthly_payment_and_import_pairs_active_one()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-07-25", -329, "NETFLIX.COM"), TestEnv.Tx("2026-08-25", -329, "NETFLIX.COM"), TestEnv.Tx("2026-09-25", -329, "NETFLIX.COM"));
        var rec = _env.Get<RecurringService>();
        Assert.Equal(1, await rec.DetectAsync());
        var suggestion = await _env.Db.RecurringPayments.SingleAsync();
        Assert.Equal(RecurringStatus.Suggested, suggestion.Status);
        Assert.Equal(Frequency.Monthly, suggestion.Frequency);
        await rec.ConfirmSuggestionAsync(suggestion.Id);
        Assert.Equal(3, await _env.FreshDb().Transactions.CountAsync(t => t.RecurringPaymentId == suggestion.Id));
        Assert.Equal(0, await rec.DetectAsync());
    }

    [Fact]
    public async Task Missing_occurrence_after_tolerance_is_alerted_until_skipped()
    {
        var rec = _env.Get<RecurringService>();
        var r = await rec.CreateAsync(new RecurringInput(_env.Bezny.Id, "ZUŠ", "ZUS", Amount: -2400, AnchorDate: new DateOnly(2026, 6, 20),
            Frequency: Frequency.Quarterly), RecurringSource.Manual);
        var alerts = await rec.AlertsAsync();
        Assert.Contains(alerts, a => a.Kind == "missing" && a.RecurringId == r.Id);
        await rec.SkipAsync(r.Id, new DateOnly(2026, 9, 20));
        Assert.DoesNotContain(await rec.AlertsAsync(), a => a.Kind == "missing");
    }
}

public class BudgetAndCategoryTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    [Theory]
    [InlineData(false, 1000, 500, 0, 50, BudgetStatus.OnPace)]
    [InlineData(false, 1000, 600, 0, 50, BudgetStatus.Faster)]
    [InlineData(false, 1000, 600, 500, 50, BudgetStatus.WontFit)]
    [InlineData(false, 1000, 1100, 0, 50, BudgetStatus.Over)]
    [InlineData(true, 1000, 0, 0, 50, BudgetStatus.Waiting)]
    [InlineData(true, 1000, 1000, 0, 50, BudgetStatus.Paid)]
    public void Budget_status(bool isFixed, decimal limit, decimal spent, decimal reserved, decimal pace, BudgetStatus expected) =>
        Assert.Equal(expected, BudgetService.Status(isFixed, limit, spent, reserved, pace));

    [Fact]
    public async Task Carry_over_personal_limits_and_child_sum()
    {
        var budgets = _env.Get<BudgetService>();
        var tx = _env.Get<TransactionService>();
        await budgets.SetAsync(new BudgetInput(_env.Cat("Supermarkety"), null, BudgetPeriod.Monthly, 10000, true));
        await budgets.SetAsync(new BudgetInput(_env.Cat("Restaurace"), null, BudgetPeriod.Monthly, 3000, false));
        await budgets.SetAsync(new BudgetInput(_env.Cat("Restaurace"), _env.Misa.Id, BudgetPeriod.Monthly, 1000, false));
        var aug = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-08-10", -9520, "Albert"));
        await tx.UpdateAsync(aug.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Supermarkety"), SetCategory: true), "V");
        var sep = await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-10", -2000, "Lokál"));
        await tx.UpdateAsync(sep.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Restaurace"), SetCategory: true), "V");

        var o = await budgets.OverviewAsync(new DateOnly(2026, 9, 1), null, false);
        var super = o.Monthly.Single(l => l.CategoryId == _env.Cat("Supermarkety"));
        Assert.Equal(480, super.CarriedIn);
        Assert.Equal(10480, super.Limit);
        var food = o.Monthly.Single(l => l.CategoryId == _env.Cat("Jídlo"));
        Assert.Null(food.OwnLimit);
        Assert.Equal(13000, food.ChildSum);

        var misa = await budgets.OverviewAsync(new DateOnly(2026, 9, 1), _env.Misa.Id, false);
        var rest = misa.Monthly.Single(l => l.CategoryId == _env.Cat("Restaurace"));
        Assert.True(rest.Personal);
        Assert.Equal(1000, rest.Limit);
        Assert.Equal(600, rest.Spent); // 30 % ze 2 000
    }

    [Fact]
    public async Task Merge_moves_payments_rules_children_and_adds_budget()
    {
        var cats = _env.Get<CategoryService>();
        var tx = _env.Get<TransactionService>();
        var kavarny = _env.Cat("Kavárny");
        var restaurace = _env.Cat("Restaurace");
        await _env.Get<BudgetService>().SetAsync(new BudgetInput(kavarny, null, BudgetPeriod.Monthly, 1000, false));
        await _env.Get<BudgetService>().SetAsync(new BudgetInput(restaurace, null, BudgetPeriod.Monthly, 3500, false));
        var imp = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", -80, "Starbucks"));
        await tx.UpdateAsync(imp.TransactionIds[0], new TxUpdate(CategoryId: kavarny, SetCategory: true), "V");
        await _env.Get<RuleService>().CreateAsync(new RuleInput([new ConditionDto2(RuleField.Merchant, RuleOp.Contains, "starbucks")], RuleLogic.And, kavarny));
        var sub = await cats.CreateAsync(new CategoryInput("Espresso bary", ParentId: kavarny));

        var preview = await cats.MergeAsync(kavarny, restaurace);
        Assert.Equal(1, preview.Transactions);
        var db = _env.FreshDb();
        Assert.Null(await db.Categories.FindAsync(kavarny));
        Assert.Equal(restaurace, (await db.Transactions.SingleAsync()).CategoryId);
        Assert.Equal(restaurace, (await db.Rules.SingleAsync()).CategoryId);
        Assert.Equal(restaurace, (await db.Categories.FindAsync(sub.Id))!.ParentId);
        Assert.Equal(4500, (await db.Categories.FindAsync(restaurace))!.BudgetAmount);
    }

    [Fact]
    public async Task Delete_and_move_are_guarded()
    {
        var cats = _env.Get<CategoryService>();
        var jidlo = _env.Cat("Jídlo");
        await Assert.ThrowsAsync<DomainException>(() => cats.UpdateAsync(jidlo, new CategoryInput(SetParent: true, ParentId: _env.Cat("Supermarkety"))));
        await Assert.ThrowsAsync<DomainException>(() => cats.DeleteAsync(jidlo));
        await Assert.ThrowsAsync<DomainException>(() => cats.UpdateAsync(_env.Cat("Supermarkety"), new CategoryInput(SetParent: true, ParentId: _env.Cat("Mzda"))));
        var imp = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-10", -80, "X"));
        await _env.Get<TransactionService>().UpdateAsync(imp.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Obědy"), SetCategory: true), "V");
        var ex = await Assert.ThrowsAsync<DomainException>(() => cats.DeleteAsync(_env.Cat("Obědy")));
        Assert.Contains("slouč", ex.Message);
        await cats.DeleteAsync(_env.Cat("Večeře"));
    }

    [Fact]
    public async Task Moving_subcategory_to_top_level_takes_parent_color_and_inherited_need_resolves()
    {
        var cats = _env.Get<CategoryService>();
        await cats.UpdateAsync(_env.Cat("Kavárny"), new CategoryInput(SetParent: true, ParentId: null));
        var tree = await cats.TreeAsync();
        var kavarny = tree.Single(n => n.Name == "Kavárny");
        Assert.Equal(0, kavarny.Depth);
        Assert.Equal(tree.Single(n => n.Name == "Jídlo").Color, kavarny.Color);
        var drogerie = tree.Single(n => n.Name == "Drogerie");
        Assert.Equal(NeedType.Need, drogerie.EffectiveNeed);
        var software = tree.Single(n => n.Name == "Software");
        Assert.Equal(NeedType.None, software.EffectiveNeed); // hlavní „Předplatné“ je Inherit → nic
    }
}

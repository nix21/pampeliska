using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class RuleEngineTests
{
    private static Transaction T(string counterparty, decimal amount = -100, string? time = null, int account = 1, string? counterAccount = null, string? mcc = null) =>
        new()
        {
            Counterparty = counterparty, Amount = amount, AmountCzk = amount, Currency = "CZK", AccountId = account, Kind = TransactionKind.Expense,
            Time = time is null ? null : TimeOnly.Parse(time), CounterpartyAccount = counterAccount, Mcc = mcc,
        };

    private static Rule R(int priority, int category, RuleLogic logic, params (RuleField f, RuleOp o, string v)[] conds) => new()
    {
        Id = priority, Priority = priority, CategoryId = category, Logic = logic, Enabled = true,
        Conditions = conds.Select((c, i) => new RuleCondition { Field = c.f, Op = c.o, Value = c.v, SortOrder = i }).ToList(),
    };

    [Theory]
    [InlineData("ALBERT HYPERMARKET 0641", "albert", true)]
    [InlineData("Albert Česká republika", "ALBERT CESKA", true)]
    [InlineData("Lidl", "albert", false)]
    public void Merchant_contains_ignores_case_and_diacritics(string counterparty, string value, bool expected) =>
        Assert.Equal(expected, RuleEngine.Matches(new RuleCondition { Field = RuleField.Merchant, Op = RuleOp.Contains, Value = value }, T(counterparty)));

    [Fact]
    public void Merchant_eq_requires_whole_counterparty() =>
        Assert.False(RuleEngine.Matches(new RuleCondition { Field = RuleField.Merchant, Op = RuleOp.Eq, Value = "Albert" }, T("Albert Praha")));

    [Theory]
    [InlineData("12:30", "11:00–14:00", RuleOp.Between, true)]
    [InlineData("15:00", "11:00–14:00", RuleOp.Between, false)]
    [InlineData("23:10", "22:00–04:00", RuleOp.Between, true)]
    [InlineData("03:59", "22:00-04:00", RuleOp.Between, true)]
    [InlineData("12:00", "22:00–04:00", RuleOp.Outside, true)]
    public void Time_ranges_including_over_midnight(string time, string range, RuleOp op, bool expected) =>
        Assert.Equal(expected, RuleEngine.Matches(new RuleCondition { Field = RuleField.Time, Op = op, Value = range }, T("x", time: time)));

    [Fact]
    public void Missing_time_never_matches_time_condition() =>
        Assert.False(RuleEngine.Matches(new RuleCondition { Field = RuleField.Time, Op = RuleOp.Outside, Value = "11:00–14:00" }, T("x")));

    [Theory]
    [InlineData(-999, "1000", RuleOp.Lt, true)]
    [InlineData(-1000, "1 000", RuleOp.Lt, false)]
    [InlineData(2500, "1000", RuleOp.Gt, true)]
    public void Amount_compares_absolute_value(decimal amount, string value, RuleOp op, bool expected) =>
        Assert.Equal(expected, RuleEngine.Matches(new RuleCondition { Field = RuleField.Amount, Op = op, Value = value }, T("x", amount)));

    [Fact]
    public void Counterparty_account_normalizes_iban_and_leading_zeros()
    {
        var c = new RuleCondition { Field = RuleField.CounterpartyAccount, Op = RuleOp.Eq, Value = "2012341/0800" };
        Assert.True(RuleEngine.Matches(c, T("x", counterAccount: "000000-0002012341/0800")));
        Assert.True(RuleEngine.Matches(c, T("x", counterAccount: "CZ65 0800 0000 0000 0201 2341")));
        Assert.False(RuleEngine.Matches(c, T("x", counterAccount: "2012341/0100")));
    }

    [Fact]
    public void First_enabled_rule_by_priority_wins_and_logic_is_respected()
    {
        var alzaCheap = R(1, 10, RuleLogic.And, (RuleField.Merchant, RuleOp.Contains, "ALZA"), (RuleField.Amount, RuleOp.Lt, "1000"));
        var alza = R(2, 20, RuleLogic.And, (RuleField.Merchant, RuleOp.Contains, "ALZA"));
        var streaming = R(3, 30, RuleLogic.Or, (RuleField.Merchant, RuleOp.Contains, "NETFLIX"), (RuleField.Merchant, RuleOp.Contains, "HBO"));
        Rule[] rules = [alza, streaming, alzaCheap];

        Assert.Equal(10, RuleEngine.FirstMatch(rules, T("Alza.cz", -500))!.CategoryId);
        Assert.Equal(20, RuleEngine.FirstMatch(rules, T("Alza.cz", -7244))!.CategoryId);
        Assert.Equal(30, RuleEngine.FirstMatch(rules, T("HBO Max"))!.CategoryId);
        alzaCheap.Enabled = false;
        Assert.Equal(20, RuleEngine.FirstMatch(rules, T("Alza.cz", -500))!.CategoryId);
    }

    [Fact]
    public void Conflicts_are_detected_between_rules_pointing_to_different_categories()
    {
        var a = R(1, 10, RuleLogic.And, (RuleField.Merchant, RuleOp.Contains, "ALZA"), (RuleField.Amount, RuleOp.Lt, "1000"));
        var b = R(2, 20, RuleLogic.And, (RuleField.Merchant, RuleOp.Contains, "ALZA"));
        var c = R(3, 20, RuleLogic.And, (RuleField.Merchant, RuleOp.Contains, "ALZA.CZ"));
        var conflicts = RuleService.DetectConflicts([a, b, c], [T("Alza.cz", -300)]);
        Assert.Equal([2, 3], conflicts[1].Order());
        Assert.Equal([1], conflicts[2]);
    }

    [Fact]
    public void Validation_rejects_bad_values()
    {
        Assert.Throws<DomainException>(() => RuleEngine.Validate(R(1, 1, RuleLogic.And, (RuleField.Time, RuleOp.Between, "poledne"))));
        Assert.Throws<DomainException>(() => RuleEngine.Validate(R(1, 1, RuleLogic.And)));
        RuleEngine.Validate(R(1, 1, RuleLogic.And, (RuleField.Amount, RuleOp.Gt, "1 000 Kč")));
    }
}

using System.Globalization;
using System.Text.RegularExpressions;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>Vyhodnocení pravidel kategorizace – čisté funkce bez DB.</summary>
public static partial class RuleEngine
{
    /// <summary>Text, ve kterém hledá podmínka „Obchodník“: protistrana, zpráva a surový text z banky.</summary>
    public static string MerchantText(Transaction t) => Text.Normalize($"{t.Counterparty} {t.Message} {t.RawText}");

    public static bool Matches(Rule rule, Transaction t)
    {
        if (rule.Conditions.Count == 0) return false;
        return rule.Logic == RuleLogic.And
            ? rule.Conditions.All(c => Matches(c, t))
            : rule.Conditions.Any(c => Matches(c, t));
    }

    public static bool Matches(RuleCondition c, Transaction t)
    {
        var value = c.Value?.Trim() ?? "";
        switch (c.Field)
        {
            case RuleField.Merchant:
                var needle = Text.Normalize(value);
                if (needle.Length == 0) return false;
                return c.Op == RuleOp.Eq ? Text.Normalize(t.Counterparty) == needle : MerchantText(t).Contains(needle);
            case RuleField.Mcc:
                return t.Mcc is { Length: > 0 } mcc && Text.Normalize(mcc) == Text.Normalize(value);
            case RuleField.Time:
                if (t.Time is not { } time || !TryParseRange(value, out var from, out var to)) return false;
                var inside = from <= to ? time >= from && time <= to : time >= from || time <= to;
                return c.Op == RuleOp.Outside ? !inside : inside;
            case RuleField.CounterpartyAccount:
                return AccountNumber.Same(t.CounterpartyAccount, value);
            case RuleField.Account:
                return int.TryParse(value, out var accountId) && t.AccountId == accountId;
            case RuleField.Amount:
                if (!TryParseAmount(value, out var limit)) return false;
                var abs = Math.Abs(t.Currency == "CZK" || t.AmountCzk == 0 ? t.Amount : t.AmountCzk);
                return c.Op switch
                {
                    RuleOp.Lt => abs < limit,
                    RuleOp.Gt => abs > limit,
                    RuleOp.Eq => abs == limit,
                    _ => false,
                };
            default:
                return false;
        }
    }

    /// <summary>První odpovídající zapnuté pravidlo podle priority.</summary>
    public static Rule? FirstMatch(IEnumerable<Rule> rules, Transaction t) =>
        rules.Where(r => r.Enabled).OrderBy(r => r.Priority).FirstOrDefault(r => Matches(r, t));

    /// <summary>Smí pravidlo pohyb (pře)zařadit? Ručně zařazené, převody a korekce ne.</summary>
    public static bool CanApplyTo(Transaction t) =>
        t.CategorySource != CategorySource.Manual && !t.IsSplit &&
        t.Kind is TransactionKind.Expense or TransactionKind.Income or TransactionKind.Refund;

    /// <summary>Použije výsledek pravidla na pohyb (kategorie, typ výdaje, člen, příznaky). Nepotvrzuje.</summary>
    public static void Apply(Rule rule, Transaction t)
    {
        t.CategoryId = rule.CategoryId;
        t.NeedOverride = rule.NeedOverride;
        t.AppliedRuleId = rule.Id;
        t.CategorySource = CategorySource.Rule;
        t.AiConfidence = null;
        t.AiReason = null;
        t.AiAlternatives = null;
        if (rule.ExcludeFromStats) t.ExcludeFromStats = true;
        if (rule.MarkRecurring) t.IsRecurring = true;
        if (rule.MemberId is { } member)
        {
            ShareService.Apply(t, [new TransactionShare { MemberId = member, Percent = 100 }]);
            t.SharesOverridden = true;
        }
    }

    public static bool TryParseRange(string value, out TimeOnly from, out TimeOnly to)
    {
        from = to = default;
        var m = RangeRegex().Match(value);
        return m.Success
               && TimeOnly.TryParse(m.Groups[1].Value, CultureInfo.InvariantCulture, out from)
               && TimeOnly.TryParse(m.Groups[2].Value, CultureInfo.InvariantCulture, out to);
    }

    public static bool TryParseAmount(string value, out decimal amount) =>
        decimal.TryParse(Regex.Replace(value, @"[\s Kč€$]", "").Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out amount);

    [GeneratedRegex(@"^\s*(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})\s*$")]
    private static partial Regex RangeRegex();

    /// <summary>Validace pravidla před uložením.</summary>
    public static void Validate(Rule rule)
    {
        if (rule.Conditions.Count == 0) throw new DomainException("Pravidlo musí mít aspoň jednu podmínku.");
        foreach (var c in rule.Conditions)
        {
            var ok = c.Field switch
            {
                RuleField.Merchant => c.Op is RuleOp.Contains or RuleOp.Eq && !string.IsNullOrWhiteSpace(c.Value),
                RuleField.Mcc => c.Op == RuleOp.Eq && !string.IsNullOrWhiteSpace(c.Value),
                RuleField.Time => c.Op is RuleOp.Between or RuleOp.Outside && TryParseRange(c.Value, out _, out _),
                RuleField.CounterpartyAccount => c.Op == RuleOp.Eq && AccountNumber.Normalize(c.Value) is not null,
                RuleField.Account => c.Op == RuleOp.Eq && int.TryParse(c.Value, out _),
                RuleField.Amount => c.Op is RuleOp.Lt or RuleOp.Gt or RuleOp.Eq && TryParseAmount(c.Value, out _),
                _ => false,
            };
            if (!ok) throw new DomainException($"Neplatná podmínka pravidla: {Describe(c)}.");
        }
    }

    public static string Describe(RuleCondition c, Func<int, string?>? accountName = null)
    {
        var field = c.Field switch
        {
            RuleField.Merchant => "Obchodník",
            RuleField.Mcc => "Typ obchodníka",
            RuleField.Time => "Čas platby",
            RuleField.CounterpartyAccount => "Protiúčet",
            RuleField.Account => "Účet",
            RuleField.Amount => "Částka",
            _ => c.Field.ToString(),
        };
        var op = c.Op switch
        {
            RuleOp.Contains => "obsahuje",
            RuleOp.Eq => "je",
            RuleOp.Lt => "je menší než",
            RuleOp.Gt => "je větší než",
            RuleOp.Between => "je mezi",
            RuleOp.Outside => "je mimo",
            _ => c.Op.ToString(),
        };
        var value = c.Field == RuleField.Account && int.TryParse(c.Value, out var id) ? accountName?.Invoke(id) ?? c.Value
            : c.Field == RuleField.Amount ? $"{c.Value} Kč" : c.Value;
        return $"{field} {op} {value}";
    }

    public static string Describe(Rule r, Func<int, string?>? accountName = null) =>
        string.Join(r.Logic == RuleLogic.And ? " a " : " nebo ", r.Conditions.OrderBy(c => c.SortOrder).Select(c => Describe(c, accountName)));
}

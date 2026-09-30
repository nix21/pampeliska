namespace Pampeliska.Core.Domain;

public enum CategoryKind { Expense, Income }
public enum BudgetPeriod { None, Monthly, Yearly }

/// <summary>Kategorie ve stromu. Barvu mají jen hlavní kategorie, podkategorie přebírají odstín.</summary>
public class Category
{
    public int Id { get; set; }
    public CategoryKind Kind { get; set; }
    public int? ParentId { get; set; }
    public Category? Parent { get; set; }
    public List<Category> Children { get; set; } = [];
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    /// <summary>Token barvy (c1…c12, pos) – jen u hlavních kategorií.</summary>
    public string? ColorToken { get; set; }
    public NeedType Need { get; set; } = NeedType.Inherit;
    public BudgetPeriod BudgetPeriod { get; set; }
    public decimal? BudgetAmount { get; set; }
    public bool CarryOver { get; set; }
    /// <summary>Fixní náklad (hypotéka…) – v rozpočtu stav Zaplaceno / Čeká na platbu.</summary>
    public bool IsFixed { get; set; }
    /// <summary>
    /// Platby v kategorii (i části rozdělených) se nezapočítávají do výdajů a příjmů – např. kauce, půjčky vlastní firmě.
    /// Dědí se na podkategorie.
    /// </summary>
    public bool ExcludeFromStats { get; set; }
}

/// <summary>Osobní limit člena v kategorii (vedle limitu domácnosti).</summary>
public class MemberBudget
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public int MemberId { get; set; }
    public BudgetPeriod Period { get; set; } = BudgetPeriod.Monthly;
    public decimal Amount { get; set; }
    public bool CarryOver { get; set; }
}

public enum RuleLogic { And, Or }
public enum RuleSource { Manual, Inbox, Ai, Mcp }
public enum RuleField { Merchant, Mcc, Time, CounterpartyAccount, Account, Amount }
public enum RuleOp { Contains, Eq, Lt, Gt, Between, Outside }

/// <summary>Pravidlo automatické kategorizace. Vyhodnocují se podle <see cref="Priority"/> vzestupně, platí první shoda.</summary>
public class Rule
{
    public int Id { get; set; }
    public int Priority { get; set; }
    public RuleLogic Logic { get; set; }
    public bool Enabled { get; set; } = true;
    public RuleSource Source { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public NeedType? NeedOverride { get; set; }
    public int? MemberId { get; set; }
    public bool ExcludeFromStats { get; set; }
    public bool MarkRecurring { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DisabledAt { get; set; }
    public List<RuleCondition> Conditions { get; set; } = [];
}

public class RuleCondition
{
    public int Id { get; set; }
    public int RuleId { get; set; }
    public RuleField Field { get; set; }
    public RuleOp Op { get; set; }
    /// <summary>Hodnota: text, číslo (Kč), "HH:MM–HH:MM", id účtu nebo číslo protiúčtu.</summary>
    public string Value { get; set; } = "";
    public int SortOrder { get; set; }
}

/// <summary>Odmítnutý návrh pravidla – znovu se nenabízí.</summary>
public class RuleSuggestionDismissal
{
    public int Id { get; set; }
    public required string Pattern { get; set; }
    public int CategoryId { get; set; }
}

/// <summary>
/// Poznámka pro AI ke kategorizaci – sdílená paměť MCP klientů (zvyklosti domácnosti, výjimky, kdy se zeptat).
/// Volitelně navázaná na obchodníka (text jako u pravidla) a/nebo kategorii; navázané se připojují k položkám fronty.
/// </summary>
public class CategorizationNote
{
    public int Id { get; set; }
    public required string Text { get; set; }
    /// <summary>Text obchodníka / protistrany (obsahuje, bez ohledu na velikost písmen a diakritiku).</summary>
    public string? MerchantPattern { get; set; }
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

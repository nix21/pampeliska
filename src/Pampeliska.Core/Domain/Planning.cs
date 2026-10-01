namespace Pampeliska.Core.Domain;

public enum AmountKind { Fixed, Variable }
public enum Frequency { Weekly, Monthly, Quarterly, Yearly }
public enum RecurringStatus { Suggested, Active, Ended }
public enum RecurringSource { Detected, Manual, Rule, Mcp }

/// <summary>Pravidelná platba – slouží pro výhled zůstatku, rezervace v rozpočtu a párování.</summary>
public class RecurringPayment
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public required string Name { get; set; }
    /// <summary>Text, který musí obsahovat protistrana (pro párování).</summary>
    public string MatchPattern { get; set; } = "";
    public int? CategoryId { get; set; }
    /// <summary>Očekávaná částka v měně účtu, záporná = odchozí.</summary>
    public decimal Amount { get; set; }
    public AmountKind AmountKind { get; set; }
    public int VariancePct { get; set; } = 10;
    public Frequency Frequency { get; set; } = Frequency.Monthly;
    /// <summary>Datum výskytu, od kterého se počítají další (den v měsíci se bere z něj).</summary>
    public DateOnly AnchorDate { get; set; }
    public int ToleranceDays { get; set; } = 3;
    public bool IsTransfer { get; set; }
    public RecurringStatus Status { get; set; }
    public RecurringSource Source { get; set; }
    public DateOnly? EndedAt { get; set; }
    /// <summary>Kde ušetřit: uživatel si ji poznamenal ke zrušení.</summary>
    public bool MarkedToCancel { get; set; }
    public string? Note { get; set; }
    /// <summary>Upozornění na jinou částku u platby z tohoto dne (a starší) uživatel odbyl „jednorázově“.</summary>
    public DateOnly? AmountAlertDismissedFor { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Výskyt pravidelné platby, který „tentokrát nebude“.</summary>
public class RecurringSkip
{
    public int Id { get; set; }
    public int RecurringPaymentId { get; set; }
    public DateOnly DueDate { get; set; }
}

public enum SavingTipStatus { Active, Hidden, Rejected }

/// <summary>
/// Kde ušetřit: rada od AI. Ukazuje se od měsíce <see cref="Since"/> dál, dokud ji uživatel neskryje
/// (AI ji dál považuje za platnou) nebo neodmítne (AI ji ani podobné už nenabízí).
/// </summary>
public class SavingTip
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public required string Body { get; set; }
    /// <summary>Krátký štítek oblasti (Předplatné, Jídlo, Účty…).</summary>
    public required string Topic { get; set; }
    /// <summary>Odhad úspory v Kč za měsíc (0 = neušetří, jen posune peníze v čase).</summary>
    public decimal MonthlySaving { get; set; }
    /// <summary>Vlastní popisek úspory místo „≈ X Kč / měs.“ (rozpětí, roční částka…).</summary>
    public string? SavingLabel { get; set; }
    /// <summary>Z čeho rada vychází („14 plateb Wolt, Pizza Nuova · červen–září“).</summary>
    public string? Evidence { get; set; }
    /// <summary>Id pohybů, ze kterých rada vychází, oddělená čárkou (pro „Ukázat platby“).</summary>
    public string? TransactionIds { get; set; }
    /// <summary>Hledaný text pro „Ukázat platby“, když rada nemá konkrétní pohyby.</summary>
    public string? Search { get; set; }
    /// <summary>Rada jen pro člena (null = domácnost).</summary>
    public int? MemberId { get; set; }
    public SavingTipStatus Status { get; set; }
    /// <summary>Den, od kterého se rada ukazuje (v jeho měsíci je „nová“).</summary>
    public DateOnly Since { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Hodnota investičního účtu k datu (ručně nebo přes MCP).</summary>
public class InvestmentValue
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public DateOnly Date { get; set; }
    public decimal Value { get; set; }
}

public enum TradeSide { Buy, Sell }

public class InvestmentTrade
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public DateOnly Date { get; set; }
    public TradeSide Side { get; set; }
    public required string Ticker { get; set; }
    public string? Name { get; set; }
    public decimal Quantity { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "EUR";
    public int? LinkedTransactionId { get; set; }
}

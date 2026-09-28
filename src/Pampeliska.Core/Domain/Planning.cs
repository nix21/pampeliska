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

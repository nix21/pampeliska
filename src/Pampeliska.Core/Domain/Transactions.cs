namespace Pampeliska.Core.Domain;

public enum BatchSource { Mcp, Manual, EnableBanking }
public enum BatchState { Uploaded, Categorized, Confirmed }

/// <summary>Dávka importu: nahráno → kategorizováno → potvrzeno.</summary>
public class ImportBatch
{
    public int Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public BatchSource Source { get; set; }
    public int? CreatedByMemberId { get; set; }
    public string? OAuthClientId { get; set; }
    public string? ClientName { get; set; }
    public BatchState State { get; set; }
    public DateTimeOffset? CategorizedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    public int Count { get; set; }
    public int DuplicateCount { get; set; }
    public int SuspectedCount { get; set; }
    public string? Note { get; set; }
    public List<SkippedDuplicate> SkippedDuplicates { get; set; } = [];
}

/// <summary>Přesná duplicita zahozená při importu – pohyb nevznikl, ale v dávce je vidět.</summary>
public class SkippedDuplicate
{
    public int Id { get; set; }
    public int BatchId { get; set; }
    public int? ExistingTransactionId { get; set; }
    public DateOnly Date { get; set; }
    public decimal Amount { get; set; }
    public string Counterparty { get; set; } = "";
    public string Payload { get; set; } = "{}";
}

public enum PaymentType { Other, Card, Transfer, DirectDebit, StandingOrder, Cash, Fee, Interest }
public enum TransactionKind { Expense, Income, Transfer, InvestmentTransfer, Refund, Correction }
public enum TransactionStatus { Suggested, Confirmed }
public enum CategorySource { Rule, Ai, Manual, Auto }

/// <summary>Typ výdaje. <see cref="Inherit"/> = převzít z nadřazené kategorie.</summary>
public enum NeedType { Inherit, Need, Joy, None }

public class Transaction
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public Account? Account { get; set; }
    public int? BatchId { get; set; }
    public ImportBatch? Batch { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly? Time { get; set; }
    /// <summary>Částka v měně účtu, záporná = odchozí.</summary>
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CZK";
    public decimal AmountCzk { get; set; }
    public decimal FxRate { get; set; } = 1;
    public string Counterparty { get; set; } = "";
    public string? CounterpartyAccount { get; set; }
    public string? Message { get; set; }
    public string? RawText { get; set; }
    public string? Mcc { get; set; }
    public PaymentType PaymentType { get; set; }
    /// <summary>Držitel karty (u karetní platby ze společného účtu), pokud ho importér zná.</summary>
    public int? CardHolderMemberId { get; set; }
    public TransactionKind Kind { get; set; }

    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public NeedType? NeedOverride { get; set; }
    public TransactionStatus Status { get; set; }
    public CategorySource? CategorySource { get; set; }
    public int? AppliedRuleId { get; set; }
    public int? AiConfidence { get; set; }
    public string? AiReason { get; set; }
    /// <summary>JSON pole alternativ AI: [{categoryId, confidence}].</summary>
    public string? AiAlternatives { get; set; }

    public bool ExcludeFromStats { get; set; }
    public bool IsRecurring { get; set; }
    public bool SharesOverridden { get; set; }
    public int? TransferPairId { get; set; }
    /// <summary>Účet domácnosti na druhé straně převodu (i když protějšek ještě není naimportovaný).</summary>
    public int? TransferAccountId { get; set; }
    /// <summary>
    /// Převod mezi vlastními účty dvou různých členů (nastavuje <see cref="Services.TransferMatcher.MarkTransfer"/>).
    /// Kategorizuje se a v pohledu člena se počítá jako výdaj/příjem, v pohledu domácnosti ne.
    /// </summary>
    public bool BetweenMembers { get; set; }
    public int? RefundOfId { get; set; }
    public int? RecurringPaymentId { get; set; }
    public int? SuspectedDuplicateOfId { get; set; }
    public string? ExternalId { get; set; }
    public string DedupKey { get; set; } = "";
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }

    public List<TransactionSplit> Splits { get; set; } = [];
    public List<TransactionShare> Shares { get; set; } = [];
    public List<TransactionEvent> Events { get; set; } = [];

    public bool IsSplit => Splits.Count > 0;
    public bool IsCategorized => CategoryId is not null || Splits.Count > 0;
    /// <summary>Započítává se do výdajů/příjmů (převody, korekce a vyřazené ne).</summary>
    public bool CountsInStats => !ExcludeFromStats && Kind is TransactionKind.Expense or TransactionKind.Income or TransactionKind.Refund;
    /// <summary>Započítává se v pohledu člena (navíc převody mezi členy), resp. domácnosti (<paramref name="memberId"/> null).</summary>
    public bool CountsFor(int? memberId) => CountsInStats || (memberId is not null && !ExcludeFromStats && BetweenMembers);
    /// <summary>Pohyb se zařazuje do kategorie (výdaj, příjem, vratka nebo převod mezi členy).</summary>
    public bool NeedsCategory => Kind is TransactionKind.Expense or TransactionKind.Income or TransactionKind.Refund || BetweenMembers;
}

/// <summary>Část rozdělené platby s vlastní kategorií. Částka ve stejné měně a se stejným znaménkem jako pohyb.</summary>
public class TransactionSplit
{
    public int Id { get; set; }
    public int TransactionId { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public decimal Amount { get; set; }
    public NeedType? NeedOverride { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>Podíl člena na pohybu (materializovaný kvůli statistikám po členech).</summary>
public class TransactionShare
{
    public int TransactionId { get; set; }
    public int MemberId { get; set; }
    public decimal Percent { get; set; }
}

/// <summary>Záznam v historii pohybu (import, návrh AI, potvrzení…).</summary>
public class TransactionEvent
{
    public int Id { get; set; }
    public int TransactionId { get; set; }
    public DateTimeOffset At { get; set; }
    public string Actor { get; set; } = "";
    public string Text { get; set; } = "";
}

namespace Pampeliska.Core.Domain;

public enum AccountKind { Current, Savings, Investment }
public enum InvestmentKind { Etf, Pension, Dip, Crypto, Other }
public enum ValueTracking { Manual, Positions, Statement }
public enum AccountSource { Mcp, EnableBanking, Manual }

public class Account
{
    public int Id { get; set; }
    public AccountKind Kind { get; set; }
    public required string InstitutionKey { get; set; }
    public Institution? Institution { get; set; }
    public required string Name { get; set; }
    public string? Iban { get; set; }
    public string Currency { get; set; } = "CZK";
    /// <summary>Vlastník; null = společný účet (podíly v <see cref="Shares"/>).</summary>
    public int? OwnerMemberId { get; set; }
    public Member? OwnerMember { get; set; }
    /// <summary>U společného účtu: platby kartou přiřadit držiteli karty.</summary>
    public bool CardToHolder { get; set; }
    public decimal? LowBalanceLimit { get; set; }
    public decimal? InterestRate { get; set; }
    public InvestmentKind? InvestmentKind { get; set; }
    public int? FundingAccountId { get; set; }
    public ValueTracking ValueTracking { get; set; } = ValueTracking.Manual;
    public AccountSource Source { get; set; } = AccountSource.Mcp;
    /// <summary>Identifikátor účtu u Enable Banking (fáze 2).</summary>
    public string? ExternalId { get; set; }
    public bool IncludeInDisposable { get; set; } = true;
    public bool IncludeInNetWorth { get; set; } = true;
    public decimal OpeningBalance { get; set; }
    public DateOnly OpeningDate { get; set; }
    /// <summary>Investiční účet: z počáteční hodnoty vloženo celkem.</summary>
    public decimal? OpeningDeposits { get; set; }
    public bool Archived { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<AccountShare> Shares { get; set; } = [];
    public List<AccountCondition> Conditions { get; set; } = [];

    public bool IsJoint => OwnerMemberId is null;
}

/// <summary>Podíl člena na společném účtu platný od data (historie poměrů).</summary>
public class AccountShare
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public DateOnly ValidFrom { get; set; }
    public int MemberId { get; set; }
    public decimal Percent { get; set; }
}

public enum ConditionType { IncomingSum, CardCount, AvgBalance }

/// <summary>Podmínka banky (např. vedení zdarma při příchozích platbách aspoň X za měsíc).</summary>
public class AccountCondition
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public ConditionType Type { get; set; }
    public decimal Target { get; set; }
    public string? Benefit { get; set; }
    public int SortOrder { get; set; }
}

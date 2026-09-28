namespace Pampeliska.Core.Domain;

/// <summary>Doménová chyba s českou hláškou pro uživatele (API vrací 400, MCP chybu nástroje).</summary>
public class DomainException(string message) : Exception(message);

/// <summary>Domácnost – instance aplikace má právě jednu.</summary>
public class Household
{
    public int Id { get; set; }
    public string Name { get; set; } = "Domácnost";
    public string BaseCurrency { get; set; } = "CZK";
    public DateTimeOffset CreatedAt { get; set; }
    public HouseholdSettings Settings { get; set; } = new();
}

public enum ThemeMode { Light, Dark, System }
public enum PeriodKind { Month, Quarter, Year, Custom }
public enum MainChartKind { Sunburst, Treemap }
public enum FxMode { DayOfPayment, MonthlyAverage }

/// <summary>Nastavení platné pro celou domácnost (obrazovka Nastavení).</summary>
public class HouseholdSettings
{
    public ThemeMode Theme { get; set; } = ThemeMode.Light;
    public PeriodKind DefaultPeriod { get; set; } = PeriodKind.Month;
    public bool ConfirmedOnlyDefault { get; set; }
    public bool HideAmountsOnStart { get; set; }
    public MainChartKind MainChart { get; set; } = MainChartKind.Sunburst;
    public FxMode FxMode { get; set; } = FxMode.DayOfPayment;
    public string NetWorthAltCurrency { get; set; } = "EUR";
    /// <summary>Okno pro hledání podobné platby při importu (±1, 3 nebo 7 dní).</summary>
    public int DedupWindowDays { get; set; } = 3;
    /// <summary>Návrh AI s jistotou alespoň tolik % se rovnou potvrdí (50–100).</summary>
    public int AiAutoConfirmThreshold { get; set; } = 90;
    public bool SuggestRules { get; set; } = true;
    public bool NotifyLowBalance { get; set; } = true;
    public bool NotifyConditions { get; set; } = true;
    public bool OnboardingDone { get; set; }
}

public enum MemberRole { Owner, Member }
public enum MemberStatus { Invited, Active }
public enum AccessScope { All, OwnAndJoint }

/// <summary>Člen domácnosti. E-mail zároveň povoluje přihlášení přes Google.</summary>
public class Member
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    /// <summary>Token barvy z palety (c1…c12).</summary>
    public string ColorToken { get; set; } = "c1";
    public MemberRole Role { get; set; } = MemberRole.Member;
    public MemberStatus Status { get; set; } = MemberStatus.Invited;
    public AccessScope AccessScope { get; set; } = AccessScope.All;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }

    public string Initials => Name.Length >= 2 ? Name[..2].ToUpperInvariant() : Name.ToUpperInvariant();
}

/// <summary>Osobní uložená volba člena (např. skryté kategorie v grafu Výdajů).</summary>
public class MemberPreference
{
    public int Id { get; set; }
    public int MemberId { get; set; }
    public required string Key { get; set; }
    public string Value { get; set; } = "null";
}

public enum InstitutionKind { Bank, Broker }

/// <summary>Číselník bank a investičních společností.</summary>
public class Institution
{
    public required string Key { get; set; }
    public required string Name { get; set; }
    public required string Abbrev { get; set; }
    public required string Color { get; set; }
    public InstitutionKind Kind { get; set; }
    public int SortOrder { get; set; }
}

public enum NotificationType { LowBalance, Condition, MissingRecurring, RecurringAmountChanged, RecurringSuggestion }
public enum NotificationSeverity { Info, Warning, Danger }

/// <summary>Upozornění v aplikaci. <see cref="Key"/> brání duplicitám stejného upozornění.</summary>
public class Notification
{
    public int Id { get; set; }
    public NotificationType Type { get; set; }
    public NotificationSeverity Severity { get; set; }
    public required string Key { get; set; }
    public required string Title { get; set; }
    public string Text { get; set; } = "";
    public int? AccountId { get; set; }
    public int? RecurringPaymentId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DismissedAt { get; set; }
}

/// <summary>Výsledek noční zálohy hlášený zálohovacím kontejnerem.</summary>
public class BackupRun
{
    public int Id { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset FinishedAt { get; set; }
    public bool Success { get; set; }
    public long? SizeBytes { get; set; }
    public string? Message { get; set; }
}

/// <summary>Kurz ČNB (Kč za 1 jednotku měny) k datu.</summary>
public class ExchangeRate
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }
    public required string Currency { get; set; }
    public decimal Rate { get; set; }
}

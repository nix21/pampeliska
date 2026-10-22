namespace Pampeliska.Core.Domain;

/// <summary>
/// Predikce domácnosti (jeden řádek): rezerva a scénář úprav proti výchozí predikci. Úpravy jsou uložené jako JSON
/// (<see cref="Services.Scenario"/>) – mění se vždy celé najednou z obrazovky Predikce.
/// </summary>
public class ForecastScenario
{
    public int Id { get; set; }
    /// <summary>Minimální zůstatek, pod který domácnost nechce klesnout (null = součet limitů disponibilních účtů).</summary>
    public decimal? Reserve { get; set; }
    public string Json { get; set; } = "{}";
    public string? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>
/// Očekávaná jednorázová platba ve výchozí predikci, kterou nejde odvodit z pravidelných plateb ani z průměru
/// (Vánoce, dovolená, vyúčtování energií – typicky odhad z loňska od AI). Uživatel ji ve scénáři může vynechat.
/// </summary>
public class ExpectedPayment
{
    public int Id { get; set; }
    public required string Name { get; set; }
    /// <summary>První den měsíce, ve kterém se platba čeká.</summary>
    public DateOnly Month { get; set; }
    /// <summary>Částka v Kč, záporná = výdaj.</summary>
    public decimal Amount { get; set; }
    /// <summary>Opakuje se každý rok ve stejném měsíci.</summary>
    public bool Yearly { get; set; }
    /// <summary>Jen za člena (null = společná, u člena se počítá podílem).</summary>
    public int? MemberId { get; set; }
    /// <summary>Z čeho odhad vychází („odhad z loňska“).</summary>
    public string? Note { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Uložená predikce – zmrazený výpočet (za domácnost i každého člena) pro pozdější porovnání se skutečností.</summary>
public class ForecastSnapshot
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public DateOnly SavedOn { get; set; }
    public int Horizon { get; set; }
    /// <summary>Pohled („all“ nebo id člena) → <see cref="Services.SnapshotPlan"/> jako JSON.</summary>
    public string PlanJson { get; set; } = "{}";
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

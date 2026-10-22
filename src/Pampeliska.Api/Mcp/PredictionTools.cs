using System.ComponentModel;
using ModelContextProtocol.Server;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Predikce disponibilního zůstatku po měsících a očekávané jednorázové platby.</summary>
[McpServerToolType]
public class PredictionTools(PredictionService prediction, CurrentUser user)
{
    public record PredictionItem(string Key, string Path, decimal Base, decimal Value, string Note);
    public record PredictionMonthSummary(string Month, decimal Income, decimal Expense, decimal Balance, decimal BaseBalance);
    public record SnapshotSummary(int Id, string Name, DateOnly SavedOn, int Horizon);

    /// <param name="Items">Položky predikce za první celý měsíc (Base = výchozí, Value = se scénářem; Kč, záporné = výdaj).</param>
    public record PredictionSummary(DateOnly Today, decimal Start, decimal Reserve, int DataMonths, IReadOnlyList<PredictionMonthSummary> Months,
        string? FirstBelowReserve, string LowestMonth, decimal Lowest, IReadOnlyList<PredictionItem> Items, IReadOnlyList<PredOneOff> OneOffs,
        IReadOnlyList<ExpectedPaymentDto> ExpectedPayments, int ScenarioChanges, IReadOnlyList<SnapshotSummary> Snapshots);

    [McpServerTool(Name = "get_prediction", Title = "Predikce zůstatku", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Predikce disponibilního zůstatku po měsících (obrazovka Predikce): dnešní zůstatek, příjmy, výdaje a zůstatek na konci každého " +
                 "měsíce se scénářem domácnosti i bez něj (BaseBalance), rezerva a kdy pod ni zůstatek klesne, položky (pevné pravidelné platby " +
                 "a průměr za posledních 6 měsíců po kategoriích), očekávané jednorázové platby (čtvrtletní a roční pravidelné, odhady) " +
                 "a uložené predikce. Aktuální měsíc obsahuje jen to, co ještě zbývá.")]
    public Task<PredictionSummary> GetPrediction(
        [Description("Horizont v měsících: 6, 12, 24 nebo 36.")] int horizon = 12,
        [Description("Id člena (jeho účty a podíl na společných).")] int? memberId = null) => McpSetup.Guard(async () =>
    {
        var p = await prediction.GetAsync(horizon, memberId);
        var col = p.Months.Count > 1 ? 1 : 0;
        var items = new List<PredictionItem>();
        void Walk(PredNode n, string path)
        {
            var full = path.Length == 0 ? n.Name : $"{path} › {n.Name}";
            if (n.Leaf is { } l) items.Add(new PredictionItem(n.Key, full, l.Base[col], l.Value[col], l.Note));
            foreach (var c in n.Children ?? []) Walk(c, full);
        }
        foreach (var n in p.Tree) Walk(n, "");
        var lowest = p.Months.MinBy(m => m.Balance)!;
        return new PredictionSummary(p.Today, p.Start, p.Reserve, p.DataMonths,
            p.Months.Select(m => new PredictionMonthSummary(m.Month, m.Income, m.Expense, m.Balance, m.BaseBalance)).ToList(),
            p.Months.FirstOrDefault(m => m.Balance < p.Reserve)?.Month, lowest.Month, lowest.Balance, items, p.OneOffs,
            await prediction.ListExpectedAsync(),
            (p.Scenario.Changes?.Count ?? 0) + (p.Scenario.Added?.Count ?? 0) + (p.Scenario.OneOffs?.Count ?? 0) + (p.Scenario.Skips?.Count ?? 0),
            p.Snapshots.Select(s => new SnapshotSummary(s.Id, s.Name, s.SavedOn, s.Horizon)).ToList());
    });

    [McpServerTool(Name = "add_expected_payment", Title = "Přidat očekávanou platbu", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Přidá do výchozí predikce očekávanou jednorázovou platbu, kterou nejde odvodit z pravidelných plateb ani z průměru – Vánoce, " +
                 "dovolená, vyúčtování energií, školní pomůcky. Typicky odhad z loňských pohybů (get_spending_by_month, get_transactions). " +
                 "Nepřidávej čtvrtletní a roční pravidelné platby – ty už v predikci jsou. Uživatel ji na obrazovce Predikce může vynechat.")]
    public Task<ExpectedPaymentDto> AddExpected(
        [Description("Název (Vánoce a dárky, Dovolená…).")] string name,
        [Description("Měsíc YYYY-MM.")] string month,
        [Description("Částka v Kč, záporná = výdaj.")] decimal amount,
        [Description("Opakuje se každý rok ve stejném měsíci.")] bool yearly = false,
        [Description("Id člena, když jde jen za něj (jinak společná).")] int? memberId = null,
        [Description("Z čeho odhad vychází, krátce („odhad z loňska“).")] string? note = null) =>
        McpSetup.Guard(async () => await prediction.AddExpectedAsync(new ExpectedPaymentInput(name, month, amount, yearly, memberId, note), await user.ActorAsync()));

    [McpServerTool(Name = "delete_expected_payment", Title = "Smazat očekávanou platbu", ReadOnly = false, Destructive = true, Idempotent = true, OpenWorld = false)]
    [Description("Smaže očekávanou platbu z výchozí predikce (id z get_prediction → ExpectedPayments).")]
    public Task<string> DeleteExpected([Description("Id očekávané platby.")] int id) =>
        McpSetup.Guard(async () => { await prediction.DeleteExpectedAsync(id); return "Smazáno."; });
}

using System.ComponentModel;
using ModelContextProtocol.Server;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Kde ušetřit: výdaje pro radost, předplatná ke zrušení a rady od AI.</summary>
[McpServerToolType]
public class SavingTools(SavingsService savings, SavingTipService tips, CurrentUser user, TimeProvider time)
{
    [McpServerTool(Name = "get_savings_overview", Title = "Kde ušetřit – přehled", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Podklady obrazovky Kde ušetřit za měsíc: výdaje pro radost a jejich podíl na všech výdajích (6 měsíců), kategorie pro radost " +
                 "proti průměru, předplatná a pravidelné platby pro radost (měsíčně/ročně v Kč, další platba, zda jsou poznamenané ke zrušení), " +
                 "disponibilní zůstatek, průměrná měsíční bilance a výhled na 12 měsíců. Výchozí bod pro hledání úspor.")]
    public Task<SavingsOverview> GetOverview(
        [Description("Měsíc YYYY-MM (výchozí aktuální).")] string? month = null,
        [Description("Id člena (jen jeho účty a společné).")] int? memberId = null) =>
        McpSetup.Guard(() => savings.OverviewAsync(month is null ? time.Today() : DateRange.Parse(month).From, memberId, false));

    [McpServerTool(Name = "mark_subscriptions_to_cancel", Title = "Poznamenat ke zrušení", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Poznamená pravidelné platby ke zrušení (true) nebo poznámku zruší (false). Je to jen připomínka pro uživatele – aplikace nic " +
                 "nevypovídá a platba dál běží. Použij jen na pokyn uživatele.")]
    public Task<string> MarkToCancel([Description("Id pravidelné platby → poznamenat ke zrušení.")] Dictionary<int, bool> marks) =>
        McpSetup.Guard(async () => { await savings.MarkToCancelAsync(marks); return "Uloženo."; });

    [McpServerTool(Name = "list_saving_tips", Title = "Rady, kde ušetřit", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Rady, kde ušetřit, uložené dřív (od tebe nebo jiného klienta) se stavem: Active (zobrazená), Hidden (uživatel ji skryl, " +
                 "ale dál platí – nepřidávej ji znovu), Rejected (uživatel ji odmítl – nenabízej ji ani podobnou). Přečti si je, než přidáš nové.")]
    public Task<List<SavingTipDto>> ListTips([Description("Jen rady v tomto stavu (volitelné).")] SavingTipStatus? status = null) =>
        McpSetup.Guard(() => tips.ListAsync(status));

    public class TipArgs
    {
        [Description("Nadpis – jedno konkrétní zjištění, např. „Rozvoz jídla roste třetí měsíc po sobě“.")] public string? Title { get; set; }
        [Description("Text 2–4 věty: co z dat vidíš (čísla, obchodníci, období) a co konkrétně udělat. Vykej (platíte, ušetříte).")]
        public string? Body { get; set; }
        [Description("Krátký štítek oblasti: Předplatné, Jídlo, Účty, Pojištění, Bydlení, Energie, Doprava, Volný čas…")] public string? Topic { get; set; }
        [Description("Odhad úspory v Kč za měsíc (0 = neušetří, jen posune peníze v čase).")] public decimal? MonthlySaving { get; set; }
        [Description("Vlastní popisek úspory místo „≈ X Kč / měs.“, když sedí líp: rozpětí nebo roční částka („≈ 1 900–2 900 Kč / rok“).")]
        public string? SavingLabel { get; set; }
        [Description("Z čeho rada vychází, stručně: „14 plateb Wolt, Pizza Nuova · červen–září“.")] public string? Evidence { get; set; }
        [Description("Id pohybů, ze kterých rada vychází (max 300) – uživatel je uvidí přes „Ukázat platby“.")] public List<int>? TransactionIds { get; set; }
        [Description("Hledaný text pro „Ukázat platby“, když nemáš konkrétní pohyby (obchodník).")] public string? Search { get; set; }
        [Description("Id člena, když se rada týká jen jeho (null = domácnost).")] public int? MemberId { get; set; }
    }

    [McpServerTool(Name = "add_saving_tip", Title = "Přidat radu, kde ušetřit", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Přidá radu na obrazovku Kde ušetřit (v aktuálním měsíci jako novou; do dalších měsíců se přenáší, dokud ji uživatel neskryje). " +
                 "Jen rady podložené daty domácnosti s konkrétními čísly. Nejdřív zkontroluj list_saving_tips: platnou radu raději aktualizuj " +
                 "(update_saving_tip), skrytou ani odmítnutou nepřidávej znovu. Uživateli pak shrň, co jsi přidal.")]
    public Task<SavingTipDto> AddTip([Description("Rada.")] TipArgs tip) => McpSetup.Guard(async () =>
        await tips.CreateAsync(new SavingTipInput(tip.Title ?? "", tip.Body ?? "", tip.Topic ?? "", tip.MonthlySaving ?? 0, tip.SavingLabel, tip.Evidence,
            tip.TransactionIds, tip.Search, tip.MemberId), await user.ActorAsync()));

    [McpServerTool(Name = "update_saving_tip", Title = "Upravit radu, kde ušetřit", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Aktualizuje radu (vynechané se nemění; savingLabel/evidence/search \"\" smaže, memberId 0 = domácnost), např. novými čísly. " +
                 "S parametrem status ji na pokyn uživatele skryje (Hidden), odmítne (Rejected) nebo vrátí mezi rady (Active).")]
    public Task<SavingTipDto> UpdateTip(
        [Description("Id rady.")] int tipId,
        [Description("Změny obsahu (volitelné).")] TipArgs? changes = null,
        [Description("Nový stav (volitelné).")] SavingTipStatus? status = null) => McpSetup.Guard(async () =>
    {
        var t = await tips.GetAsync(tipId);
        if (changes is { } c)
            t = await tips.UpdateAsync(tipId, new SavingTipInput(c.Title ?? t.Title, c.Body ?? t.Body, c.Topic ?? t.Topic, c.MonthlySaving ?? t.MonthlySaving,
                c.SavingLabel ?? t.SavingLabel, c.Evidence ?? t.Evidence, c.TransactionIds ?? t.TransactionIds.ToList(), c.Search ?? t.Search,
                c.MemberId is null ? t.MemberId : c.MemberId == 0 ? null : c.MemberId));
        if (status is { } s) t = await tips.SetStatusAsync(tipId, s);
        return t;
    });

    [McpServerTool(Name = "delete_saving_tip", Title = "Smazat radu, kde ušetřit", ReadOnly = false, Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Smaže radu, která přestala platit (předplatné je zrušené, situace se změnila). Odmítnuté rady smazat nejde – " +
                 "slouží jako paměť, co nenabízet. Uživateli řekni, co jsi smazal.")]
    public Task<string> DeleteTip([Description("Id rady.")] int tipId) =>
        McpSetup.Guard(async () => { await tips.DeleteAsync(tipId); return "Smazáno."; });
}

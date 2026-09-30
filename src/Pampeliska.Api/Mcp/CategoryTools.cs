using System.ComponentModel;
using ModelContextProtocol.Server;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Strom kategorií a pravidla kategorizace (čtení i správa).</summary>
[McpServerToolType]
public class CategoryTools(CategoryService categories, RuleService rules, StatsService stats)
{
    [McpServerTool(Name = "list_categories", Title = "Kategorie", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Celý strom kategorií (výdaje i příjmy): id, rodič, cesta „Jídlo › Supermarkety“, typ výdaje (need: Inherit/Need/Joy/None a effectiveNeed), " +
                 "barva, rozpočet domácnosti, nezapočítávání do statistik (excludeFromStats vlastní, effectiveExclude i zděděné). Volitelně s útratou za období.")]
    public Task<object> ListCategories([Description("Období pro útratu (např. 2026-09), volitelné.")] string? period = null) => McpSetup.Guard(async () =>
    {
        var tree = await categories.TreeAsync();
        if (period is null) return (object)tree;
        var spent = (await stats.ExpensesAsync(new StatsFilter(DateRange.Parse(period)), compare: false)).Categories
            .Where(c => c.CategoryId is not null).ToDictionary(c => c.CategoryId!.Value, c => c.Amount);
        var income = (await stats.ExpensesAsync(new StatsFilter(DateRange.Parse(period)), compare: false, CategoryKind.Income)).Categories
            .Where(c => c.CategoryId is not null).ToDictionary(c => c.CategoryId!.Value, c => c.Amount);
        return tree.Select(n => new { category = n, amount = n.Kind == CategoryKind.Expense ? spent.GetValueOrDefault(n.Id) : income.GetValueOrDefault(n.Id) }).ToList();
    });

    [McpServerTool(Name = "create_category", Title = "Založit kategorii", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Založí kategorii (hlavní nebo podkategorii). Barvu má jen hlavní kategorie (c1–c12). Nejdřív se zeptej uživatele.")]
    public Task<object> CreateCategory(
        [Description("Název.")] string name,
        [Description("Id nadřazené kategorie; null = hlavní kategorie.")] int? parentId = null,
        [Description("Expense nebo Income (u podkategorie se převezme z rodiče).")] CategoryKind kind = CategoryKind.Expense,
        [Description("Typ výdaje: Inherit (zdědit), Need, Joy, None.")] NeedType need = NeedType.Inherit,
        [Description("Barva hlavní kategorie: c1…c12.")] string? color = null,
        [Description("Platby v kategorii (i podkategoriích) nezapočítávat do výdajů a příjmů.")] bool excludeFromStats = false) => McpSetup.Guard(async () =>
    {
        var c = await categories.CreateAsync(new CategoryInput(name, kind, parentId, Color: color, Need: need, ExcludeFromStats: excludeFromStats));
        return (object)new { c.Id, c.Name };
    });

    [McpServerTool(Name = "update_category", Title = "Upravit kategorii", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Přejmenuje, přesune (move=true + parentId, null = hlavní), změní barvu, typ výdaje, rozpočet domácnosti, pořadí kategorie " +
                 "nebo nezapočítávání do statistik.")]
    public Task<string> UpdateCategory(
        [Description("Id kategorie.")] int categoryId,
        [Description("Nový název.")] string? name = null,
        [Description("Přesunout pod parentId.")] bool move = false,
        [Description("Nová nadřazená kategorie (s move=true).")] int? parentId = null,
        [Description("Barva c1…c12 (jen hlavní kategorie).")] string? color = null,
        [Description("Typ výdaje: Inherit, Need, Joy, None.")] NeedType? need = null,
        [Description("Perioda rozpočtu: None, Monthly, Yearly.")] BudgetPeriod? budgetPeriod = null,
        [Description("Limit rozpočtu v Kč (0/None = bez limitu).")] decimal? budgetAmount = null,
        [Description("Přenášet nevyčerpaný rozpočet.")] bool? carryOver = null,
        [Description("Fixní náklad (hypotéka…).")] bool? isFixed = null,
        [Description("Pozice mezi sourozenci (0 = první).")] int? position = null,
        [Description("Platby v kategorii (i podkategoriích) nezapočítávat do výdajů a příjmů.")] bool? excludeFromStats = null) => McpSetup.Guard(async () =>
    {
        await categories.UpdateAsync(categoryId, new CategoryInput(name, null, parentId, move, color, need, budgetPeriod,
            budgetPeriod == BudgetPeriod.None ? null : budgetAmount, budgetAmount is not null || budgetPeriod == BudgetPeriod.None, carryOver, isFixed, position,
            excludeFromStats));
        return "Uloženo.";
    });

    [McpServerTool(Name = "merge_category", Title = "Sloučit kategorii", ReadOnly = false, Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Sloučí kategorii do cílové: přesune platby (i části rozdělených), pravidla, pravidelné platby a podkategorie, sečte rozpočet. " +
                 "Zdrojová kategorie zanikne. Nejdřív se zeptej uživatele.")]
    public Task<MergePreview> MergeCategory([Description("Id slučované kategorie.")] int sourceId, [Description("Id cílové kategorie.")] int targetId) =>
        McpSetup.Guard(() => categories.MergeAsync(sourceId, targetId));

    [McpServerTool(Name = "delete_category", Title = "Smazat kategorii", ReadOnly = false, Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Smaže prázdnou kategorii (bez plateb, podkategorií a pravidel). Kategorii s platbami je potřeba sloučit. Nejdřív se zeptej uživatele.")]
    public Task<string> DeleteCategory([Description("Id kategorie.")] int categoryId) =>
        McpSetup.Guard(async () => { await categories.DeleteAsync(categoryId); return "Smazáno."; });

    [McpServerTool(Name = "list_rules", Title = "Pravidla", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Pravidla kategorizace v pořadí vyhodnocování (position 1 = první, platí první shoda) se statistikou použití a konflikty.")]
    public Task<List<RuleDto>> ListRules() => McpSetup.Guard(rules.ListAsync);

    public class RuleConditionArg
    {
        [Description("Merchant (obchodník/text), Mcc (typ obchodníka), Time (čas), CounterpartyAccount (protiúčet), Account (id účtu), Amount (částka v Kč).")]
        public RuleField Field { get; set; }
        [Description("Merchant: Contains/Eq; Mcc, CounterpartyAccount, Account: Eq; Time: Between/Outside; Amount: Lt/Gt/Eq.")]
        public RuleOp Op { get; set; }
        [Description("Hodnota: text, „11:00–14:00“, číslo účtu, id účtu nebo částka.")] public string Value { get; set; } = "";
    }

    private static List<ConditionDto2>? Conds(List<RuleConditionArg>? c) => c?.Select(x => new ConditionDto2(x.Field, x.Op, x.Value)).ToList();

    [McpServerTool(Name = "test_rule", Title = "Otestovat pravidlo", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Zkusí (i neuložené) pravidlo na platbách za 6 měsíců: kolik odpovídá, kolik by se změnilo a ukázky („vyhraje pravidlo K“, „Stará → Nová“).")]
    public Task<RuleTestResult> TestRule(
        [Description("Podmínky.")] List<RuleConditionArg> conditions,
        [Description("Cílová kategorie.")] int categoryId,
        [Description("And = všechny platí, Or = kterákoli.")] RuleLogic logic = RuleLogic.And,
        [Description("Pozice v pořadí (výchozí na konec).")] int? position = null) =>
        McpSetup.Guard(() => rules.TestAsync(new RuleInput(Conds(conditions), logic, categoryId, Position: position)));

    [McpServerTool(Name = "create_rule", Title = "Založit pravidlo", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Založí pravidlo. Výchozí pozice je na konci (nejnižší priorita). S applyToHistory=true ho použije i na existující platby " +
                 "(kromě ručně zařazených). Nejdřív ho ukaž uživateli, ideálně s test_rule.")]
    public Task<object> CreateRule(
        [Description("Podmínky.")] List<RuleConditionArg> conditions,
        [Description("Cílová kategorie.")] int categoryId,
        [Description("And / Or.")] RuleLogic logic = RuleLogic.And,
        [Description("Přebít typ výdaje: Need, Joy (null = z kategorie).")] NeedType? need = null,
        [Description("Připsat členovi (id).")] int? memberId = null,
        [Description("Nezapočítávat do statistik.")] bool excludeFromStats = false,
        [Description("Označit jako pravidelnou.")] bool markRecurring = false,
        [Description("Pozice (1 = nahoře).")] int? position = null,
        [Description("Použít i na existující platby.")] bool applyToHistory = true) => McpSetup.Guard(async () =>
    {
        var r = await rules.CreateAsync(new RuleInput(Conds(conditions), logic, categoryId, need, need is not null, memberId, memberId is not null,
            excludeFromStats, markRecurring, true, position, RuleSource.Mcp));
        var changed = applyToHistory ? await rules.ApplyToHistoryAsync(r.Id) : 0;
        return (object)new { r.Id, changed };
    });

    [McpServerTool(Name = "update_rule", Title = "Upravit pravidlo", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Upraví podmínky, výsledek, zapnutí nebo pozici pravidla. Vynechané parametry se nemění.")]
    public Task<string> UpdateRule(
        [Description("Id pravidla.")] int ruleId,
        [Description("Nové podmínky (celý seznam).")] List<RuleConditionArg>? conditions = null,
        [Description("Cílová kategorie.")] int? categoryId = null,
        [Description("And / Or.")] RuleLogic? logic = null,
        [Description("Zapnuto.")] bool? enabled = null,
        [Description("Nezapočítávat.")] bool? excludeFromStats = null,
        [Description("Pravidelná.")] bool? markRecurring = null,
        [Description("Pozice.")] int? position = null) => McpSetup.Guard(async () =>
    {
        await rules.UpdateAsync(ruleId, new RuleInput(Conds(conditions), logic, categoryId, ExcludeFromStats: excludeFromStats, MarkRecurring: markRecurring,
            Enabled: enabled, Position: position));
        return "Uloženo.";
    });

    [McpServerTool(Name = "move_rule", Title = "Přesunout pravidlo", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Změní pořadí pravidla (1 = vyhodnocuje se první).")]
    public Task<string> MoveRule([Description("Id pravidla.")] int ruleId, [Description("Nová pozice.")] int position) =>
        McpSetup.Guard(async () => { await rules.MoveAsync(ruleId, position); return "Přesunuto."; });

    [McpServerTool(Name = "delete_rule", Title = "Smazat pravidlo", ReadOnly = false, Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Smaže pravidlo (zařazení plateb zůstane). Nejdřív se zeptej uživatele.")]
    public Task<string> DeleteRule([Description("Id pravidla.")] int ruleId) =>
        McpSetup.Guard(async () => { await rules.DeleteAsync(ruleId); return "Smazáno."; });

    [McpServerTool(Name = "apply_rule_to_history", Title = "Použít pravidlo zpětně", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Použije pravidlo na existující platby, kde je první shodou (ručně zařazené a rozdělené se nemění). Vrací počet změn.")]
    public Task<object> ApplyRule([Description("Id pravidla.")] int ruleId) =>
        McpSetup.Guard(async () => (object)new { changed = await rules.ApplyToHistoryAsync(ruleId) });

    [McpServerTool(Name = "get_rule_suggestions", Title = "Návrhy pravidel", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Obchodníci, které uživatel aspoň 3× ručně zařadil do stejné kategorie a nemají pravidlo.")]
    public Task<List<RuleSuggestion>> RuleSuggestions() => McpSetup.Guard(() => rules.SuggestionsAsync(20));
}

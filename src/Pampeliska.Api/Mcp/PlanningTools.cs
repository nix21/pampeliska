using System.ComponentModel;
using ModelContextProtocol.Server;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Pravidelné platby, výhled, podmínky účtů, rozpočty, investice a čisté jmění.</summary>
[McpServerToolType]
public class PlanningTools(RecurringService recurring, ForecastService forecast, ConditionService conditions, BudgetService budgets,
    InvestmentService investments, TimeProvider time)
{
    [McpServerTool(Name = "list_recurring_payments", Title = "Pravidelné platby", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Pravidelné platby (aktivní i návrhy detekce se stavem Suggested) s měsíčním/ročním ekvivalentem, dalším termínem a historií párování.")]
    public Task<List<RecurringDto>> ListRecurring([Description("Včetně ukončených.")] bool includeEnded = false) =>
        McpSetup.Guard(() => recurring.ListAsync(includeEnded));

    public class RecurringArgs
    {
        [Description("Účet.")] public int? AccountId { get; set; }
        [Description("Název (Hypotéka, Netflix…).")] public string? Name { get; set; }
        [Description("Text, který musí obsahovat protistrana/zpráva pohybu (pro párování).")] public string? MatchPattern { get; set; }
        [Description("Kategorie.")] public int? CategoryId { get; set; }
        [Description("Očekávaná částka v měně účtu, záporná = odchozí.")] public decimal? Amount { get; set; }
        [Description("Fixed (pevná) nebo Variable (proměnlivá).")] public AmountKind? AmountKind { get; set; }
        [Description("U proměnlivé rozptyl v %.")] public int? VariancePct { get; set; }
        [Description("Weekly, Monthly, Quarterly, Yearly.")] public Frequency? Frequency { get; set; }
        [Description("Datum některého výskytu (určuje den v měsíci).")] public DateOnly? AnchorDate { get; set; }
        [Description("Tolerance párování ± dní.")] public int? ToleranceDays { get; set; }
        [Description("Převod mezi vlastními účty (nerezervuje rozpočet).")] public bool? IsTransfer { get; set; }
    }

    private static RecurringInput Input(RecurringArgs a) => new(a.AccountId, a.Name, a.MatchPattern, a.CategoryId, a.CategoryId is not null, a.Amount, a.AmountKind,
        a.VariancePct, a.Frequency, a.AnchorDate, a.ToleranceDays, a.IsTransfer);

    [McpServerTool(Name = "create_recurring_payment", Title = "Založit pravidelnou platbu", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Založí aktivní pravidelnou platbu (jde do výhledu zůstatku a rezervací rozpočtu) a spáruje minulé výskyty.")]
    public Task<object> CreateRecurring([Description("Údaje.")] RecurringArgs payment) => McpSetup.Guard(async () =>
    {
        var r = await recurring.CreateAsync(Input(payment), RecurringSource.Mcp);
        return (object)new { r.Id };
    });

    [McpServerTool(Name = "update_recurring_payment", Title = "Upravit pravidelnou platbu", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Upraví pravidelnou platbu (vynechané se nemění).")]
    public Task<string> UpdateRecurring([Description("Id.")] int recurringId, [Description("Změny.")] RecurringArgs changes) =>
        McpSetup.Guard(async () => { await recurring.UpdateAsync(recurringId, Input(changes)); return "Uloženo."; });

    [McpServerTool(Name = "confirm_recurring_suggestion", Title = "Potvrdit návrh pravidelné platby", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Potvrdí návrh z detekce (stav Suggested → Active).")]
    public Task<string> ConfirmRecurring([Description("Id.")] int recurringId) =>
        McpSetup.Guard(async () => { await recurring.ConfirmSuggestionAsync(recurringId); return "Potvrzeno."; });

    [McpServerTool(Name = "end_recurring_payment", Title = "Ukončit pravidelnou platbu", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Ukončí pravidelnou platbu (návrh smaže).")]
    public Task<string> EndRecurring([Description("Id.")] int recurringId) =>
        McpSetup.Guard(async () => { await recurring.EndAsync(recurringId); return "Ukončeno."; });

    [McpServerTool(Name = "pair_recurring_occurrence", Title = "Spárovat výskyt", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Ručně přiřadí pohyb k pravidelné platbě (např. když přišla jinak pojmenovaná).")]
    public Task<string> PairRecurring([Description("Id pravidelné platby.")] int recurringId, [Description("Id pohybu.")] int transactionId) =>
        McpSetup.Guard(async () => { await recurring.PairAsync(recurringId, transactionId); return "Spárováno."; });

    [McpServerTool(Name = "get_balance_forecast", Title = "Výhled zůstatku", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Výhled zůstatku účtů podle pravidelných plateb: minimum, zda klesne pod limit, kolik a do kdy doplnit, a zbytek do výplaty.")]
    public Task<object> GetForecast([Description("Horizont ve dnech (30, 60, 90).")] int horizon = 30, [Description("Jen účet.")] int? accountId = null) =>
        McpSetup.Guard(async () => (object)new { accounts = await forecast.ForecastAsync(horizon, accountId), untilPayday = await forecast.UntilPaydayAsync() });

    [McpServerTool(Name = "get_conditions_status", Title = "Podmínky účtů", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Plnění podmínek bank za kalendářní měsíc (počet plateb kartou, příchozí platby, průměrný zůstatek): splněno X/Y, co chybí a kolik dní zbývá.")]
    public Task<ConditionsSummary> GetConditions([Description("Měsíc YYYY-MM (výchozí aktuální).")] string? month = null) =>
        McpSetup.Guard(() => conditions.EvaluateAsync(month: month is null ? null : DateRange.Parse(month).From));

    [McpServerTool(Name = "get_budgets", Title = "Rozpočty", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Rozpočty za měsíc: limit, útrata, rezervace pravidelnými platbami, stav (V tempu, Rychleji než tempo, Nevejde se, Přečerpáno…) " +
                 "a roční rozpočty. S memberId osobní limity člena.")]
    public Task<BudgetOverview> GetBudgets([Description("Měsíc YYYY-MM.")] string? month = null, [Description("Id člena.")] int? memberId = null) =>
        McpSetup.Guard(() => budgets.OverviewAsync(month is null ? time.Today() : DateRange.Parse(month).From, memberId, false));

    [McpServerTool(Name = "set_budget", Title = "Nastavit rozpočet", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Nastaví limit rozpočtu kategorie – pro domácnost (memberId null) nebo osobní limit člena. amount null zruší limit.")]
    public Task<string> SetBudget(
        [Description("Id výdajové kategorie.")] int categoryId,
        [Description("Monthly nebo Yearly.")] BudgetPeriod period,
        [Description("Limit v Kč (null = zrušit).")] decimal? amount,
        [Description("Osobní limit člena (null = domácnost).")] int? memberId = null,
        [Description("Přenášet nevyčerpané.")] bool? carryOver = null) =>
        McpSetup.Guard(async () => { await budgets.SetAsync(new BudgetInput(categoryId, memberId, period, amount, carryOver)); return "Uloženo."; });

    [McpServerTool(Name = "get_net_worth", Title = "Čisté jmění", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Čisté jmění po měsících ve vrstvách (běžné, spořicí, cizí měny, investice) v Kč.")]
    public Task<NetWorth> GetNetWorth([Description("Počet měsíců.")] int months = 12, [Description("Id člena.")] int? memberId = null) =>
        McpSetup.Guard(() => investments.NetWorthAsync(months, memberId));

    [McpServerTool(Name = "get_investments", Title = "Investice", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Investiční účty: hodnota, vklady, zisk, historie zadaných hodnot, pozice z obchodů a obchody.")]
    public Task<List<InvestmentAccountView>> GetInvestments() => McpSetup.Guard(investments.AccountsAsync);

    [McpServerTool(Name = "add_investment_value", Title = "Zadat hodnotu portfolia", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Zapíše hodnotu investičního účtu k datu (v měně účtu), např. z výpisu brokera. Nepovinně i „vloženo celkem“ k tomuto datu – "
        + "od něj se pak další vklady dopočítávají z převodů na účet.")]
    public Task<string> AddValue([Description("Id investičního účtu.")] int accountId, [Description("Datum.")] DateOnly date, [Description("Hodnota.")] decimal value,
        [Description("Nepovinně: vloženo celkem k datu (součet všech vkladů mínus výběrů, v měně účtu).")] decimal? deposits = null) =>
        McpSetup.Guard(async () => { await investments.AddValueAsync(accountId, date, value, deposits); return "Uloženo."; });

    [McpServerTool(Name = "add_investment_trade", Title = "Zapsat obchod", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Zapíše nákup/prodej (ticker, kusy, cena). Nákup se sám naváže na převod na investiční účet v okolí data.")]
    public Task<object> AddTrade(
        [Description("Id investičního účtu.")] int accountId, [Description("Datum.")] DateOnly date, [Description("Buy nebo Sell.")] TradeSide side,
        [Description("Ticker (VWCE…).")] string ticker, [Description("Počet kusů.")] decimal quantity, [Description("Cena za kus.")] decimal price,
        [Description("Název fondu.")] string? name = null, [Description("Měna ceny.")] string? currency = null) => McpSetup.Guard(async () =>
    {
        var t = await investments.AddTradeAsync(new TradeInput(accountId, date, side, ticker, name, quantity, price, currency, null));
        return (object)new { t.Id, t.LinkedTransactionId };
    });
}

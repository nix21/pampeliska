using System.ComponentModel;
using ModelContextProtocol.Server;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Import pohybů, fronta ke kategorizaci, návrhy a zařazení, dávky, duplicity a převody.</summary>
[McpServerToolType]
public class TransactionTools(ImportService import, TransactionService txs, InboxService inbox, BatchService batches, TransferMatcher transfers,
    CurrentUser user)
{
    public class ImportTx
    {
        [Description("Datum zaúčtování (YYYY-MM-DD).")] public DateOnly Date { get; set; }
        [Description("Částka v měně účtu se znaménkem: záporná = odchozí platba, kladná = příchozí.")] public decimal Amount { get; set; }
        [Description("Obchodník / protistrana (název, jak ho uvádí výpis).")] public string? Counterparty { get; set; }
        [Description("Zpráva pro příjemce / popis transakce.")] public string? Message { get; set; }
        [Description("Původní text řádku výpisu (pro kontrolu a pravidla).")] public string? RawText { get; set; }
        [Description("Číslo protiúčtu (123-456789/0800 nebo IBAN), pokud je ve výpisu.")] public string? CounterpartyAccount { get; set; }
        [Description("Čas transakce HH:MM, pokud ho výpis uvádí.")] public TimeOnly? Time { get; set; }
        [Description("Typ platby: Card (platba kartou – důležité pro podmínky účtů), Transfer, DirectDebit (inkaso), StandingOrder (trvalý příkaz), Cash, Fee, Interest, Other.")]
        public PaymentType? PaymentType { get; set; }
        [Description("MCC nebo typ obchodníka (např. Restaurace, Supermarket), pokud je znám.")] public string? Mcc { get; set; }
        [Description("Jednoznačné ID transakce z banky, pokud ho výpis má (zlepší deduplikaci).")] public string? ExternalId { get; set; }
        [Description("U karetní platby ze společného účtu: id člena – držitele karty (z get_household), pokud je z výpisu poznat.")]
        public int? CardHolderMemberId { get; set; }
        [Description("Měna – jen pro kontrolu, musí odpovídat měně účtu.")] public string? Currency { get; set; }
    }

    public record ImportResponse(int BatchId, int Created, int SkippedDuplicates, int SuspectedDuplicates, int CategorizedByRule, int Transfers,
        int Uncategorized, string Next);

    [McpServerTool(Name = "import_transactions", Title = "Importovat pohyby", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Nahraje pohyby z výpisu na jeden účet do dávky (jako nepotvrzené). Přesné duplicity přeskočí (opakovaný import nevadí), " +
                 "podobné označí k vyřešení, převody mezi vlastními účty spáruje a použije pravidla. Vrací dávku a počty. " +
                 "Více účtů = více volání; pro stejný výpis lze předat batch_id předchozí dávky.")]
    public Task<ImportResponse> ImportTransactions(
        [Description("Id účtu z list_accounts.")] int accountId,
        [Description("Pohyby (max 2000 v jednom volání).")] List<ImportTx> transactions,
        [Description("Id existující nepotvrzené dávky, do které se mají pohyby přidat (volitelné).")] int? batchId = null,
        [Description("Poznámka k dávce, např. „Výpis Fio 09/2026“.")] string? note = null) => McpSetup.Guard(async () =>
    {
        var member = await user.MemberAsync();
        var res = await import.ImportAsync(accountId,
            transactions.Select(t => new ImportItem(t.Date, t.Amount, t.Counterparty, t.Time, t.Currency, t.CounterpartyAccount, t.Message, t.RawText,
                t.PaymentType, t.Mcc, t.ExternalId, t.CardHolderMemberId)).ToList(),
            new ImportOptions(BatchSource.Mcp, await user.ActorAsync(), member?.Id, user.ClientId, user.ClientName, note, batchId));
        return new ImportResponse(res.BatchId, res.Created, res.SkippedDuplicates, res.SuspectedDuplicates, res.CategorizedByRule, res.Transfers,
            res.Uncategorized, res.Uncategorized > 0 || res.CategorizedByRule > 0
                ? "Pokračuj get_categorization_queue a suggest_categories." : "Vše je zařazeno, uživatel může dávku potvrdit.");
    });

    [McpServerTool(Name = "get_categorization_queue", Title = "Fronta ke kategorizaci", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Nepotvrzené pohyby čekající na zařazení (nejstarší první) i s návrhem pravidla/AI a s podobnými dřív zařazenými platbami " +
                 "stejného obchodníka – použij je jako vodítko pro suggest_categories.")]
    public Task<List<QueueItem>> GetCategorizationQueue(
        [Description("Kolik pohybů vrátit (1–200).")] int limit = 50,
        [Description("Jen pohyby bez jakéhokoli návrhu.")] bool onlyUncategorized = false,
        [Description("Jen pohyby z dané dávky.")] int? batchId = null) =>
        McpSetup.Guard(() => inbox.QueueForAiAsync(limit, onlyUncategorized, batchId));

    public class Suggestion
    {
        [Description("Id pohybu.")] public int TransactionId { get; set; }
        [Description("Id kategorie (list_categories). Nevyplňuj, když posíláš splits.")] public int? CategoryId { get; set; }
        [Description("Rozdělení platby na části: částky se znaménkem platby, součet musí sedět.")] public List<SplitInput>? Splits { get; set; }
        [Description("Jistota 0–100 %.")] public int Confidence { get; set; }
        [Description("Krátké zdůvodnění česky (zobrazí se uživateli).")] public string? Reason { get; set; }
        [Description("Další možné kategorie s jistotou.")] public List<AiAlternative>? Alternatives { get; set; }
    }

    [McpServerTool(Name = "suggest_categories", Title = "Navrhnout kategorie", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Uloží návrhy kategorií (nebo rozdělení) od AI. Návrh s jistotou alespoň na prahu domácnosti se rovnou potvrdí, ostatní čekají " +
                 "na uživatele ve frontě Ke kategorizaci. Ručně zařazené a potvrzené pohyby se nemění.")]
    public Task<SuggestResult> SuggestCategories([Description("Návrhy.")] List<Suggestion> suggestions) => McpSetup.Guard(async () =>
        await txs.SuggestAsync(suggestions.Select(s => new AiSuggestion(s.TransactionId, s.CategoryId, s.Splits, s.Confidence, s.Reason, s.Alternatives)).ToList(),
            await user.ActorAsync()));

    public class Categorization
    {
        [Description("Id pohybu.")] public int TransactionId { get; set; }
        [Description("Id kategorie (null = ponechat).")] public int? CategoryId { get; set; }
        [Description("Rozdělení na části (částky se znaménkem platby).")] public List<SplitInput>? Splits { get; set; }
        [Description("Typ výdaje na této platbě: Need, Joy, None (Inherit = podle kategorie).")] public NeedType? Need { get; set; }
        [Description("Připsat platbu jednomu členovi (id z get_household).")] public int? MemberId { get; set; }
        [Description("Nezapočítávat do statistik.")] public bool? ExcludeFromStats { get; set; }
        [Description("Označit jako pravidelnou.")] public bool? Recurring { get; set; }
        [Description("Poznámka k platbě.")] public string? Note { get; set; }
    }

    [McpServerTool(Name = "categorize_transactions", Title = "Zařadit pohyby", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Přímé zařazení pohybů na pokyn uživatele (jako ruční zařazení – pravidla ho pak nepřepíšou). S confirm=true je rovnou potvrdí. " +
                 "Před potvrzením si nech změny od uživatele schválit.")]
    public Task<object> CategorizeTransactions(
        [Description("Pohyby a co s nimi.")] List<Categorization> items,
        [Description("Rovnou potvrdit.")] bool confirm = false) => McpSetup.Guard(async () =>
    {
        var actor = await user.ActorAsync();
        var errors = new List<string>();
        var ok = 0;
        foreach (var i in items)
        {
            try
            {
                await txs.UpdateAsync(i.TransactionId, new TxUpdate(
                    CategoryId: i.CategoryId, SetCategory: i.CategoryId is not null && i.Splits is not { Count: > 0 }, Splits: i.Splits,
                    NeedOverride: i.Need, SetNeed: i.Need is not null, MemberId: i.MemberId, SetMember: i.MemberId is not null,
                    ExcludeFromStats: i.ExcludeFromStats, IsRecurring: i.Recurring, Note: i.Note, Confirm: confirm ? true : null), actor);
                ok++;
            }
            catch (DomainException e) { errors.Add($"{i.TransactionId}: {e.Message}"); }
        }
        return (object)new { updated = ok, errors };
    });

    [McpServerTool(Name = "confirm_transactions", Title = "Potvrdit pohyby", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Potvrdí zařazené pohyby (nezařazené přeskočí). Použij jen se souhlasem uživatele.")]
    public Task<object> ConfirmTransactions([Description("Id pohybů.")] List<int> transactionIds) => McpSetup.Guard(async () =>
        (object)new { confirmed = await txs.ConfirmAsync(transactionIds, await user.ActorAsync()) });

    [McpServerTool(Name = "resolve_duplicate", Title = "Vyřešit duplicitu", ReadOnly = false, Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Podezřelá duplicita z importu: keep=false pohyb zahodí (smaže), keep=true ponechá oba pohyby.")]
    public Task<string> ResolveDuplicate([Description("Id podezřelého pohybu.")] int transactionId, [Description("Ponechat oba.")] bool keep) =>
        McpSetup.Guard(async () =>
        {
            await txs.ResolveDuplicateAsync(transactionId, keep, await user.ActorAsync());
            return keep ? "Ponecháno." : "Duplicita zahozena.";
        });

    [McpServerTool(Name = "link_transfer", Title = "Spárovat převod", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Ručně spáruje odchozí a příchozí pohyb mezi dvěma vlastními účty jako převod (není výdaj ani příjem).")]
    public Task<string> LinkTransfer([Description("Id prvního pohybu.")] int transactionIdA, [Description("Id druhého pohybu.")] int transactionIdB) =>
        McpSetup.Guard(async () => { await transfers.LinkAsync(transactionIdA, transactionIdB); return "Spárováno."; });

    [McpServerTool(Name = "unlink_transfer", Title = "Rozpárovat převod", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Zruší párování převodu – oba pohyby se vrátí mezi výdaje/příjmy ke kategorizaci.")]
    public Task<string> UnlinkTransfer([Description("Id jednoho z pohybů.")] int transactionId) =>
        McpSetup.Guard(async () => { await transfers.UnpairAsync(transactionId); return "Rozpárováno."; });

    [McpServerTool(Name = "finish_batch_categorization", Title = "Dokončit kategorizaci dávky", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Znovu použije pravidla na nezařazené pohyby dávky a vrátí její stav. Potvrzení celé dávky dělá uživatel ve webu.")]
    public Task<BatchSummary> FinishBatch([Description("Id dávky.")] int batchId) => McpSetup.Guard(async () =>
    {
        await batches.RunRulesAsync(batchId);
        return (await batches.GetAsync(batchId)).Batch;
    });

    [McpServerTool(Name = "list_batches", Title = "Dávky", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Poslední dávky importu se stavem (Uploaded → Categorized → Confirmed) a počty.")]
    public Task<List<BatchSummary>> ListBatches([Description("Kolik dávek.")] int take = 20) => McpSetup.Guard(() => batches.ListAsync(take));

    [McpServerTool(Name = "get_batch", Title = "Detail dávky", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Pohyby dávky a přeskočené duplicity.")]
    public Task<BatchDetail> GetBatch([Description("Id dávky.")] int batchId) => McpSetup.Guard(() => batches.GetAsync(batchId));

    [McpServerTool(Name = "get_transactions", Title = "Pohyby", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Pohyby s filtry. Období: „2026-09“, „2026-Q3“, „2026“ nebo „2026-04-01..2026-09-28“. Částky: amount v měně účtu, amountCzk v Kč.")]
    public Task<TxPage> GetTransactions(
        [Description("Období.")] string? period = null,
        [Description("Id účtu.")] int? accountId = null,
        [Description("Id kategorie (včetně podkategorií).")] int? categoryId = null,
        [Description("Id člena (jen jeho pohyby a podíly).")] int? memberId = null,
        [Description("All, Expense, Income, Transfer.")] KindFilter kind = KindFilter.All,
        [Description("Hledaný text (obchodník, zpráva, částka).")] string? search = null,
        [Description("Jen nezařazené.")] bool uncategorized = false,
        [Description("Jen nepotvrzené.")] bool unconfirmed = false,
        [Description("Řazení: DateDesc, AmountDesc, DateAsc.")] TxSort sort = TxSort.DateDesc,
        [Description("Přeskočit (stránkování).")] int skip = 0,
        [Description("Počet (max 500).")] int take = 100) => McpSetup.Guard(() =>
        txs.ListAsync(new TxFilter(period is null ? null : DateRange.Parse(period), accountId, memberId, kind, categoryId, search,
            Uncategorized: uncategorized, Unconfirmed: unconfirmed, Sort: sort, Skip: skip, Take: Math.Min(take, 500))));

    [McpServerTool(Name = "get_transaction", Title = "Detail pohybu", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Detail pohybu: rozdělení, podíly členů, historie, návrh AI, spárovaný převod, pravidlo.")]
    public Task<TxDetail> GetTransaction([Description("Id pohybu.")] int transactionId) => McpSetup.Guard(() => txs.GetAsync(transactionId));
}

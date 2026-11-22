using System.ComponentModel;
using ModelContextProtocol.Server;
using Pampeliska.Api.Endpoints;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

/// <summary>Přijaté e-maily z bank (notifikace a výpisy), adresa pro příjem a jeho nastavení.</summary>
[McpServerToolType]
public class InboundEmailTools(InboundEmailService emails, InboundEmailProcessor processor, StatementPasswordService passwords, CurrentUser user)
{
    private const int TextLimit = 30_000;

    [McpServerTool(Name = "list_inbound_emails", Title = "Přijaté e-maily", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("E-maily, které banky poslaly na adresu Pampelišky (notifikace o pohybech a výpisy), nejnovější první. Stavy: Received (čeká na " +
                 "zpracování), Imported (pohyb zapsán jako předběžný), Statement (výpis načten), NotMovement (není pohyb), Quarantined (neověřený " +
                 "odesílatel), NeedsAccount (vyberte účet), NeedsPassword (zamčené PDF, žádné heslo nesedí), Failed (chyba).")]
    public Task<List<InboundEmailRow>> ListInboundEmails(
        [Description("Jen e-maily v tomto stavu.")] InboundEmailState? state = null,
        [Description("Jen e-maily, které čekají na uživatele (Quarantined, NeedsAccount, NeedsPassword, Failed).")] bool needsAttention = false,
        [Description("Nejvýš kolik e-mailů (výchozí 50).")] int limit = 50) => McpSetup.Guard(async () =>
    {
        InboundEmailState[] attention = [InboundEmailState.Quarantined, InboundEmailState.NeedsAccount, InboundEmailState.NeedsPassword, InboundEmailState.Failed];
        return (await emails.ListAsync())
            .Where(e => state is null || e.State == state)
            .Where(e => !needsAttention || attention.Contains(e.State))
            .Take(Math.Clamp(limit, 1, 500)).ToList();
    });

    [McpServerTool(Name = "get_inbound_email", Title = "Detail e-mailu", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Detail přijatého e-mailu: text, přílohy (index pro read_inbound_email_attachment), ověření odesílatele (DKIM), vysvětlení stavu, " +
                 "vytažené pohyby, zapsané pohyby a u výpisu souhrn po účtech (období, spárováno s notifikacemi, nově, chybí, zůstatek).")]
    public Task<InboundEmailDetail> GetInboundEmail([Description("Id e-mailu.")] int emailId) => McpSetup.Guard(async () =>
    {
        var d = await emails.DetailAsync(emailId);
        return d.TextBody is { Length: > TextLimit } t ? d with { TextBody = t[..TextLimit] + "\n… (zkráceno)" } : d;
    });

    [McpServerTool(Name = "read_inbound_email_attachment", Title = "Přečíst přílohu e-mailu", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Text přílohy (PDF nebo CSV výpis). Zamčené PDF se otevře uloženými hesly k výpisům – heslo samo se nevrací. Hodí se, když " +
                 "server výpis nenačetl sám: přečti ho a pohyby pošli přes import_transactions (s periodFrom a periodTo).")]
    public Task<AttachmentText> ReadInboundEmailAttachment(
        [Description("Id e-mailu.")] int emailId,
        [Description("Index přílohy z get_inbound_email (od 0).")] int index) => McpSetup.Guard(() => processor.AttachmentTextAsync(emailId, index));

    public record ProcessResult(InboundEmailState State, string? Note);

    [McpServerTool(Name = "process_inbound_email", Title = "Zpracovat e-mail znovu", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = true)]
    [Description("Zpracuje e-mail znovu: ověří odesílatele, přečte pohyb nebo výpis (Claude Haiku na serveru) a zapíše ho. force=true zpracuje i e-mail " +
                 "od neověřeného nebo nepovoleného odesílatele (z karantény) – jen když uživatel potvrdí, že je od jeho banky.")]
    public Task<ProcessResult> ProcessInboundEmail(
        [Description("Id e-mailu.")] int emailId,
        [Description("Zpracovat i od neověřeného odesílatele.")] bool force = false) => McpSetup.Guard(async () =>
    {
        var state = await processor.ProcessAsync(emailId, force);
        return new ProcessResult(state, (await emails.DetailAsync(emailId)).Note);
    });

    [McpServerTool(Name = "assign_inbound_email_account", Title = "Přiřadit e-mail k účtu", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("E-mail ve stavu NeedsAccount: zapíše pohyb (nebo výpis) na zvolený účet. remember=true si u notifikace zapamatuje kartu, " +
                 "u výpisu číslo účtu (když ho účet ještě nemá), aby se příště přiřadil sám.")]
    public Task<ProcessResult> AssignInboundEmailAccount(
        [Description("Id e-mailu.")] int emailId,
        [Description("Id účtu z list_accounts.")] int accountId,
        [Description("Zapamatovat kartu / číslo účtu.")] bool remember = true) => McpSetup.Guard(async () =>
    {
        var state = await processor.AssignAccountAsync(emailId, accountId, remember);
        return new ProcessResult(state, (await emails.DetailAsync(emailId)).Note);
    });

    [McpServerTool(Name = "delete_inbound_email", Title = "Smazat e-mail", ReadOnly = false, Destructive = true, Idempotent = true, OpenWorld = false)]
    [Description("Smaže přijatý e-mail (pohyby z něj zapsané zůstanou). Jen na výslovný pokyn uživatele.")]
    public Task<string> DeleteInboundEmail([Description("Id e-mailu.")] int emailId) => McpSetup.Guard(async () =>
    {
        await emails.DeleteAsync(emailId);
        return "Smazáno.";
    });

    public record InboundSettings(InboundAddress Address, IReadOnlyList<InboundSenderRow> Senders, IReadOnlyList<InboundAccountRow> Accounts,
        IReadOnlyList<StatementPasswordRow> StatementPasswords);

    [McpServerTool(Name = "get_inbound_email_settings", Title = "Nastavení příjmu e-mailů", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Adresa, na kterou banky posílají notifikace a výpisy, jestli příjem a čtení běží, povolení odesílatelé (domény bank), " +
                 "karty a čísla účtů pro přiřazení a hesla k zamčeným PDF výpisům (jen popisky, hodnoty se nevrací).")]
    public Task<InboundSettings> GetInboundEmailSettings() => McpSetup.Guard(async () =>
        new InboundSettings(await emails.AddressAsync(), await processor.SendersAsync(), await processor.AccountsAsync(), await passwords.ListAsync()));

    [McpServerTool(Name = "set_inbound_sender", Title = "Povolit odesílatele", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Povolí nebo zakáže odesílatele e-mailů podle domény z podpisu DKIM (např. moneta.cz). Známé české banky jsou povolené samy.")]
    public Task<string> SetInboundSender(
        [Description("Doména odesílatele.")] string domain,
        [Description("Povolit (true) nebo zakázat (false).")] bool enabled = true,
        [Description("Název banky pro zobrazení.")] string? name = null) => McpSetup.Guard(async () =>
    {
        await processor.SetSenderAsync(domain, enabled, name);
        return enabled ? $"Odesílatel {domain} je povolený." : $"Odesílatel {domain} je zakázaný.";
    });

    [McpServerTool(Name = "remove_inbound_sender", Title = "Odebrat odesílatele", ReadOnly = false, Destructive = true, Idempotent = true, OpenWorld = false)]
    [Description("Odebere vlastní záznam odesílatele (u známé banky vrátí výchozí povolení).")]
    public Task<string> RemoveInboundSender([Description("Doména odesílatele.")] string domain) => McpSetup.Guard(async () =>
    {
        await processor.RemoveSenderAsync(domain);
        return "Odebráno.";
    });

    [McpServerTool(Name = "set_account_cards", Title = "Karty u účtu", ReadOnly = false, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Nastaví poslední 4 číslice karet u účtu – notifikace o platbě kartou se podle nich přiřadí k účtu. Nahrazuje celý seznam.")]
    public Task<string> SetAccountCards(
        [Description("Id účtu.")] int accountId,
        [Description("Poslední 4 číslice karet, např. [\"1234\"]. Prázdný seznam karty odebere.")] List<string> cardSuffixes) => McpSetup.Guard(async () =>
    {
        await processor.SetCardsAsync(accountId, cardSuffixes);
        return "Uloženo.";
    });

    [McpServerTool(Name = "add_statement_password", Title = "Přidat heslo k výpisům", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Uloží heslo k zamčeným PDF výpisům (např. poslední 4 číslice rodného čísla, telefon, klientské číslo). Uloží se zašifrovaně a " +
                 "už nikdy se nevrátí. E-maily ve stavu NeedsPassword se pak zpracují znovu samy. Jen vlastník domácnosti a jen na pokyn uživatele.")]
    public Task<StatementPasswordRow> AddStatementPassword(
        [Description("Popisek, např. „RČ – poslední 4 číslice“. Nesmí obsahovat samotné heslo.")] string label,
        [Description("Heslo.")] string password,
        [Description("Doména banky (např. csas.cz), u které se heslo zkouší jako první; bez ní u všech.")] string? senderDomain = null) => McpSetup.Guard(async () =>
    {
        await InboundEmailEndpoints.RequireOwnerAsync(user, "Hesla k výpisům může spravovat jen vlastník domácnosti.");
        return await passwords.AddAsync(label, password, senderDomain);
    });

    [McpServerTool(Name = "delete_statement_password", Title = "Smazat heslo k výpisům", ReadOnly = false, Destructive = true, Idempotent = true, OpenWorld = false)]
    [Description("Smaže uložené heslo k výpisům (id z get_inbound_email_settings). Jen vlastník domácnosti.")]
    public Task<string> DeleteStatementPassword([Description("Id hesla.")] int passwordId) => McpSetup.Guard(async () =>
    {
        await InboundEmailEndpoints.RequireOwnerAsync(user, "Hesla k výpisům může spravovat jen vlastník domácnosti.");
        await passwords.DeleteAsync(passwordId);
        return "Smazáno.";
    });

    [McpServerTool(Name = "regenerate_inbound_address", Title = "Nová adresa pro příjem", ReadOnly = false, Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Vytvoří novou adresu pro příjem e-mailů – stará okamžitě přestane přijímat a v bankách ji bude potřeba změnit. " +
                 "Jen vlastník domácnosti a jen po výslovném potvrzení uživatele (např. když na adresu chodí spam).")]
    public Task<InboundAddress> RegenerateInboundAddress() => McpSetup.Guard(async () =>
    {
        await InboundEmailEndpoints.RequireOwnerAsync(user, "Novou adresu může vytvořit jen vlastník domácnosti.");
        return await emails.RegenerateAsync();
    });
}

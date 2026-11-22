using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record ProcessInput(bool Force);
public record AssignInput(int AccountId, bool RememberCard);
public record SenderInput(string Domain, bool Enabled, string? Name);
public record CardsInput(List<string> CardSuffixes);
public record PasswordInput(string Label, string? Value, string? SenderDomain);

/// <summary>Přijaté e-maily z bank (notifikace a výpisy) a adresa, na kterou chodí.</summary>
public static class InboundEmailEndpoints
{
    public static void MapInboundEmailEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/inbound-emails", (InboundEmailService svc) => svc.ListAsync());
        api.MapGet("/inbound-emails/{id:int}", (int id, InboundEmailService svc) => svc.DetailAsync(id));
        api.MapGet("/inbound-emails/{id:int}/raw", async (int id, InboundEmailService svc) =>
        {
            var (raw, name) = await svc.RawAsync(id);
            return Results.File(raw, "message/rfc822", name);
        });
        api.MapDelete("/inbound-emails/{id:int}", async (int id, InboundEmailService svc) =>
        {
            await svc.DeleteAsync(id);
            return Results.NoContent();
        });

        // Nahrání .eml (záloha pro e-maily, které nedorazily přes SMTP, a pro vývoj). Tělo požadavku = surový e-mail.
        api.MapPost("/inbound-emails", async (HttpRequest req, InboundEmailService svc, CancellationToken ct) =>
        {
            using var ms = new MemoryStream();
            await req.Body.CopyToAsync(ms, ct);
            var r = await svc.StoreAsync(ms.ToArray(), InboundEmailSource.Upload, ct: ct);
            return Results.Ok(r);
        });

        // Zpracování (vytažení pohybů): znovu, „přesto“ od nepovoleného odesílatele, výběr účtu
        api.MapPost("/inbound-emails/{id:int}/process", async (int id, ProcessInput? input, InboundEmailProcessor p, CancellationToken ct) =>
            new { State = await p.ProcessAsync(id, input?.Force ?? false, ct) });
        api.MapPost("/inbound-emails/{id:int}/assign", async (int id, AssignInput input, InboundEmailProcessor p, CancellationToken ct) =>
            new { State = await p.AssignAccountAsync(id, input.AccountId, input.RememberCard, ct) });

        api.MapGet("/inbound-emails/senders", (InboundEmailProcessor p) => p.SendersAsync());
        api.MapPut("/inbound-emails/senders", async (SenderInput input, InboundEmailProcessor p) =>
        {
            await p.SetSenderAsync(input.Domain, input.Enabled, input.Name);
            return Results.NoContent();
        });
        api.MapDelete("/inbound-emails/senders/{domain}", async (string domain, InboundEmailProcessor p) =>
        {
            await p.RemoveSenderAsync(domain);
            return Results.NoContent();
        });

        api.MapGet("/inbound-emails/accounts", (InboundEmailProcessor p) => p.AccountsAsync());
        api.MapPut("/inbound-emails/accounts/{id:int}/cards", async (int id, CardsInput input, InboundEmailProcessor p) =>
        {
            await p.SetCardsAsync(id, input.CardSuffixes);
            return Results.NoContent();
        });

        // Hesla k zamčeným PDF výpisům – hodnota se nikdy nevrací
        api.MapGet("/inbound-emails/passwords", (StatementPasswordService svc) => svc.ListAsync());
        api.MapPost("/inbound-emails/passwords", async (PasswordInput input, StatementPasswordService svc, CurrentUser user) =>
        {
            await RequireOwnerAsync(user, "Hesla k výpisům může spravovat jen vlastník domácnosti.");
            return await svc.AddAsync(input.Label, input.Value ?? "", input.SenderDomain);
        });
        api.MapPut("/inbound-emails/passwords/{id:int}", async (int id, PasswordInput input, StatementPasswordService svc, CurrentUser user) =>
        {
            await RequireOwnerAsync(user, "Hesla k výpisům může spravovat jen vlastník domácnosti.");
            await svc.UpdateAsync(id, input.Label, input.Value, input.SenderDomain);
            return Results.NoContent();
        });
        api.MapDelete("/inbound-emails/passwords/{id:int}", async (int id, StatementPasswordService svc, CurrentUser user) =>
        {
            await RequireOwnerAsync(user, "Hesla k výpisům může spravovat jen vlastník domácnosti.");
            await svc.DeleteAsync(id);
            return Results.NoContent();
        });
        api.MapGet("/inbound-emails/{id:int}/attachments/{index:int}/text", (int id, int index, InboundEmailProcessor p, CancellationToken ct) =>
            p.AttachmentTextAsync(id, index, ct));

        api.MapGet("/inbound-emails/address", (InboundEmailService svc) => svc.AddressAsync());
        api.MapPost("/inbound-emails/address/regenerate", async (InboundEmailService svc, CurrentUser user) =>
        {
            await RequireOwnerAsync(user, "Novou adresu může vytvořit jen vlastník domácnosti.");
            return await svc.RegenerateAsync();
        });
    }

    public static async Task RequireOwnerAsync(CurrentUser user, string message)
    {
        var me = await user.RequireMemberAsync();
        if (me.Role != MemberRole.Owner) throw new DomainException(message);
    }
}

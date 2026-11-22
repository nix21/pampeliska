using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

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

        api.MapGet("/inbound-emails/address", (InboundEmailService svc) => svc.AddressAsync());
        api.MapPost("/inbound-emails/address/regenerate", async (InboundEmailService svc, CurrentUser user) =>
        {
            var me = await user.RequireMemberAsync();
            if (me.Role != MemberRole.Owner) throw new DomainException("Novou adresu může vytvořit jen vlastník domácnosti.");
            return await svc.RegenerateAsync();
        });
    }
}

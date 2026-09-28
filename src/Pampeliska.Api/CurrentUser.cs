using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Api.OAuth;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Api;

/// <summary>Přihlášený člen (cookie ve webu, OAuth grant v MCP) a popis aktéra pro historii pohybů.</summary>
public class CurrentUser(IHttpContextAccessor http, AppDbContext db)
{
    private Member? _member;

    public ClaimsPrincipal? Principal => http.HttpContext?.User;
    public string? Email => Principal?.FindFirstValue(ClaimTypes.Email)?.ToLowerInvariant();
    public string? ClientId => Principal?.FindFirstValue(OAuthDefaults.ClientIdClaim);
    public string? ClientName => Principal?.FindFirstValue(OAuthDefaults.ClientNameClaim);
    public bool IsMcp => ClientId is not null;

    public async Task<Member?> MemberAsync()
    {
        if (_member is not null || Email is null) return _member;
        _member = await db.Members.FirstOrDefaultAsync(m => m.Email == Email);
        return _member;
    }

    public async Task<Member> RequireMemberAsync() =>
        await MemberAsync() ?? throw new DomainException("Přihlášený účet není členem domácnosti.");

    /// <summary>Kdo akci provedl, např. „Vašek“ nebo „Claude Desktop (Vašek)“.</summary>
    public async Task<string> ActorAsync()
    {
        var name = (await MemberAsync())?.Name ?? Email ?? "systém";
        return IsMcp ? $"{ClientName ?? "MCP klient"} ({name})" : name;
    }
}

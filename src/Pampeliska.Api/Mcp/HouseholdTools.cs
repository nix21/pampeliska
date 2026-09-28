using System.ComponentModel;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Server;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Mcp;

[McpServerToolType]
public class HouseholdTools(AppDbContext db, FxService fx, TimeProvider time)
{
    public record MemberInfo(int Id, string Name, string Email, string Role, string Status);
    public record HouseholdInfo(string Name, string BaseCurrency, IReadOnlyList<MemberInfo> Members, HouseholdSettings Settings,
        IReadOnlyDictionary<string, decimal> Rates, string Today);

    [McpServerTool(Name = "get_household", Title = "Domácnost", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Domácnost: členové (id pro podíly a pravidla), nastavení (práh automatického potvrzení AI, okno deduplikace), " +
                 "aktuální kurzy ČNB a dnešní datum.")]
    public Task<HouseholdInfo> GetHousehold() => McpSetup.Guard(async () =>
    {
        var h = await db.Households.AsNoTracking().FirstAsync();
        var members = await db.Members.AsNoTracking().OrderBy(m => m.SortOrder).ToListAsync();
        var today = Core.Clock.Today(time);
        return new HouseholdInfo(h.Name, h.BaseCurrency,
            members.Select(m => new MemberInfo(m.Id, m.Name, m.Email, m.Role.ToString(), m.Status.ToString())).ToList(),
            h.Settings, await fx.LatestAsync(today), today.ToString("yyyy-MM-dd"));
    });
}

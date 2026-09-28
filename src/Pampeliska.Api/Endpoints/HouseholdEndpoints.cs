using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

public record SettingsInput(string? Name, ThemeMode? Theme, PeriodKind? DefaultPeriod, bool? ConfirmedOnlyDefault, bool? HideAmountsOnStart,
    MainChartKind? MainChart, FxMode? FxMode, string? NetWorthAltCurrency, int? DedupWindowDays, int? AiAutoConfirmThreshold,
    bool? SuggestRules, bool? NotifyLowBalance, bool? NotifyConditions);

public record MemberDto(int Id, string Name, string Email, string ColorToken, string Initials, MemberRole Role, MemberStatus Status,
    DateTimeOffset? LastLoginAt);

public static class HouseholdEndpoints
{
    public static MemberDto ToDto(Member m) => new(m.Id, m.Name, m.Email, m.ColorToken, m.Initials, m.Role, m.Status, m.LastLoginAt);

    public static void MapHouseholdEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/household", async (AppDbContext db, FxService fx, TimeProvider time) =>
        {
            var h = await db.Households.AsNoTracking().FirstAsync();
            var members = await db.Members.AsNoTracking().OrderBy(m => m.SortOrder).ThenBy(m => m.Id).ToListAsync();
            var today = Core.Clock.Today(time);
            return new
            {
                h.Name, h.BaseCurrency, h.Settings,
                Members = members.Select(ToDto),
                AccountCount = await db.Accounts.CountAsync(a => !a.Archived),
                Rates = await fx.LatestAsync(today),
                RatesDate = await fx.LatestRateDateAsync(),
                Today = today,
                LastBackup = await db.BackupRuns.AsNoTracking().OrderByDescending(b => b.StartedAt).FirstOrDefaultAsync(),
            };
        });

        api.MapPut("/household/settings", async (SettingsInput i, HouseholdService svc) =>
            await svc.UpdateSettingsAsync(s =>
            {
                if (i.Theme is { } t) s.Theme = t;
                if (i.DefaultPeriod is { } p) s.DefaultPeriod = p;
                if (i.ConfirmedOnlyDefault is { } c) s.ConfirmedOnlyDefault = c;
                if (i.HideAmountsOnStart is { } hide) s.HideAmountsOnStart = hide;
                if (i.MainChart is { } mc) s.MainChart = mc;
                if (i.FxMode is { } fm) s.FxMode = fm;
                if (i.NetWorthAltCurrency is { } cur) s.NetWorthAltCurrency = cur;
                if (i.DedupWindowDays is { } dw) s.DedupWindowDays = dw;
                if (i.AiAutoConfirmThreshold is { } th) s.AiAutoConfirmThreshold = th;
                if (i.SuggestRules is { } sr) s.SuggestRules = sr;
                if (i.NotifyLowBalance is { } nl) s.NotifyLowBalance = nl;
                if (i.NotifyConditions is { } nc) s.NotifyConditions = nc;
            }, i.Name));

        api.MapPost("/household/onboarding", async (OnboardingInput input, HouseholdService svc, CurrentUser user, MemberDirectory directory) =>
        {
            var me = await user.RequireMemberAsync();
            await svc.CompleteOnboardingAsync(input, me.Id);
            directory.Invalidate();
            return Results.NoContent();
        });

        api.MapPost("/household/delete-data", async (DeleteHouseholdInput input, HouseholdService svc, CurrentUser user) =>
        {
            var me = await user.RequireMemberAsync();
            if (me.Role != MemberRole.Owner) throw new DomainException("Smazat data domácnosti může jen vlastník.");
            await svc.DeleteAllDataAsync(input.ConfirmName);
            return Results.NoContent();
        });

        api.MapGet("/institutions", (AccountQueries q) => q.InstitutionsAsync());
        api.MapGet("/category-templates", () => Seed.CategoryTemplates);

        api.MapGet("/members", async (AppDbContext db) =>
            (await db.Members.AsNoTracking().OrderBy(m => m.SortOrder).ThenBy(m => m.Id).ToListAsync()).Select(ToDto));
        api.MapPost("/members", async (MemberInput input, HouseholdService svc, MemberDirectory directory) =>
        {
            var m = await svc.AddMemberAsync(input);
            directory.Invalidate();
            return ToDto(m);
        });
        api.MapPut("/members/{id:int}", async (int id, MemberInput input, HouseholdService svc, MemberDirectory directory) =>
        {
            var m = await svc.UpdateMemberAsync(id, input);
            directory.Invalidate();
            return ToDto(m);
        });
        api.MapDelete("/members/{id:int}", async (int id, HouseholdService svc, CurrentUser user, MemberDirectory directory) =>
        {
            var me = await user.RequireMemberAsync();
            await svc.RemoveMemberAsync(id, me.Id);
            directory.Invalidate();
            return Results.NoContent();
        });

        api.MapGet("/preferences/{key}", async (string key, AppDbContext db, CurrentUser user) =>
        {
            var me = await user.RequireMemberAsync();
            var p = await db.MemberPreferences.AsNoTracking().FirstOrDefaultAsync(x => x.MemberId == me.Id && x.Key == key);
            return Results.Content(p?.Value ?? "null", "application/json");
        });
        api.MapPut("/preferences/{key}", async (string key, HttpRequest req, AppDbContext db, CurrentUser user) =>
        {
            var me = await user.RequireMemberAsync();
            using var reader = new StreamReader(req.Body);
            var value = await reader.ReadToEndAsync();
            if (value.Length > 20_000) throw new DomainException("Hodnota je příliš dlouhá.");
            var p = await db.MemberPreferences.FirstOrDefaultAsync(x => x.MemberId == me.Id && x.Key == key);
            if (p is null) db.MemberPreferences.Add(new MemberPreference { MemberId = me.Id, Key = key, Value = value });
            else p.Value = value;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

public record DeleteHouseholdInput(string ConfirmName);

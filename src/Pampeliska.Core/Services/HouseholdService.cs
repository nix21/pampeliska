using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record MemberInput(string? Name = null, string? Email = null, string? ColorToken = null, MemberRole? Role = null);

public record OnboardingAccount(string Name, string InstitutionKey, string Currency, int? OwnerIndex, AccountKind Kind = AccountKind.Current);

public record OnboardingInput(string HouseholdName, List<MemberInput> Members, List<OnboardingAccount> Accounts, string Template, AccountSource Source);

/// <summary>Domácnost, členové a průvodce prvním spuštěním.</summary>
public partial class HouseholdService(AppDbContext db, AccountService accounts, TimeProvider time)
{
    public static readonly string[] MemberColors = ["c1", "c4", "c3", "c5", "c6", "c7", "c2", "c8", "c9", "c10", "c11", "c12"];

    public Task<Household> GetAsync() => db.Households.FirstAsync();

    public async Task<Member> AddMemberAsync(MemberInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) throw new DomainException("Člen musí mít jméno.");
        var email = NormalizeEmail(input.Email) ?? throw new DomainException("Zadej e-mail, kterým se člen bude přihlašovat přes Google.");
        if (await db.Members.AnyAsync(m => m.Email == email)) throw new DomainException($"Člen s e-mailem {email} už existuje.");
        var used = await db.Members.Select(m => m.ColorToken).ToListAsync();
        var m = new Member
        {
            Name = input.Name.Trim(), Email = email, Role = input.Role ?? MemberRole.Member, Status = MemberStatus.Invited,
            ColorToken = input.ColorToken ?? MemberColors.FirstOrDefault(c => !used.Contains(c)) ?? "c1",
            CreatedAt = time.GetUtcNow(), SortOrder = used.Count,
        };
        db.Members.Add(m);
        await db.SaveChangesAsync();
        return m;
    }

    public async Task<Member> UpdateMemberAsync(int id, MemberInput input)
    {
        var m = await db.Members.FindAsync(id) ?? throw new DomainException($"Člen {id} neexistuje.");
        if (input.Name is { } name)
        {
            if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Člen musí mít jméno.");
            m.Name = name.Trim();
        }
        if (input.Email is not null)
        {
            var email = NormalizeEmail(input.Email) ?? throw new DomainException("Neplatný e-mail.");
            if (email != m.Email && await db.Members.AnyAsync(x => x.Email == email)) throw new DomainException($"E-mail {email} už používá jiný člen.");
            m.Email = email;
        }
        if (input.ColorToken is { } color) m.ColorToken = color;
        if (input.Role is { } role)
        {
            if (m.Role == MemberRole.Owner && role != MemberRole.Owner && await db.Members.CountAsync(x => x.Role == MemberRole.Owner) == 1)
                throw new DomainException("Domácnost musí mít aspoň jednoho vlastníka.");
            m.Role = role;
        }
        await db.SaveChangesAsync();
        return m;
    }

    public async Task RemoveMemberAsync(int id, int currentMemberId)
    {
        var m = await db.Members.FindAsync(id) ?? throw new DomainException($"Člen {id} neexistuje.");
        if (id == currentMemberId) throw new DomainException("Sám sebe z domácnosti odebrat nelze.");
        if (m.Role == MemberRole.Owner && await db.Members.CountAsync(x => x.Role == MemberRole.Owner) == 1)
            throw new DomainException("Posledního vlastníka nelze odebrat.");
        if (await db.Accounts.AnyAsync(a => a.OwnerMemberId == id))
            throw new DomainException($"{m.Name} vlastní účty. Nejdřív je převeď na jiného člena nebo označ jako společné.");
        if (await db.TransactionShares.AnyAsync(s => s.MemberId == id) || await db.AccountShares.AnyAsync(s => s.MemberId == id))
            throw new DomainException($"{m.Name} má podíly na pohybech nebo společných účtech, odebrat nejde.");
        db.MemberBudgets.RemoveRange(await db.MemberBudgets.Where(b => b.MemberId == id).ToListAsync());
        db.MemberPreferences.RemoveRange(await db.MemberPreferences.Where(b => b.MemberId == id).ToListAsync());
        foreach (var r in await db.Rules.Where(r => r.MemberId == id).ToListAsync()) r.MemberId = null;
        db.Members.Remove(m);
        await db.SaveChangesAsync();
    }

    public async Task<HouseholdSettings> UpdateSettingsAsync(Action<HouseholdSettings> update, string? name = null)
    {
        var h = await db.Households.FirstAsync();
        update(h.Settings);
        if (h.Settings.DedupWindowDays is not (1 or 3 or 7)) throw new DomainException("Okno deduplikace musí být 1, 3 nebo 7 dní.");
        if (h.Settings.AiAutoConfirmThreshold is < 50 or > 100) throw new DomainException("Práh AI musí být mezi 50 a 100 %.");
        if (!FxService.Currencies.Contains(h.Settings.NetWorthAltCurrency)) throw new DomainException("Nepodporovaná měna.");
        if (name is not null)
        {
            if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Domácnost musí mít název.");
            h.Name = name.Trim();
        }
        await db.SaveChangesAsync();
        return h.Settings;
    }

    /// <summary>Průvodce prvním spuštěním: název, členové (první = přihlášený), účty, šablona kategorií.</summary>
    public async Task CompleteOnboardingAsync(OnboardingInput input, int currentMemberId)
    {
        var h = await db.Households.FirstAsync();
        if (h.Settings.OnboardingDone) throw new DomainException("Průvodce už byl dokončen.");
        if (string.IsNullOrWhiteSpace(input.HouseholdName)) throw new DomainException("Zadej název domácnosti.");
        h.Name = input.HouseholdName.Trim();

        var me = await db.Members.FindAsync(currentMemberId) ?? throw new DomainException("Přihlášený účet není členem domácnosti.");
        var memberIds = new List<int>();
        for (var i = 0; i < input.Members.Count; i++)
        {
            var mi = input.Members[i];
            if (i == 0)
            {
                if (!string.IsNullOrWhiteSpace(mi.Name)) me.Name = mi.Name.Trim();
                if (mi.ColorToken is { } c) me.ColorToken = c;
                memberIds.Add(me.Id);
                continue;
            }
            if (string.IsNullOrWhiteSpace(mi.Name)) continue;
            var existing = NormalizeEmail(mi.Email) is { } e ? await db.Members.FirstOrDefaultAsync(m => m.Email == e) : null;
            memberIds.Add((existing ?? await AddMemberAsync(mi)).Id);
        }
        await db.SaveChangesAsync();

        foreach (var a in input.Accounts)
        {
            int? owner = a.OwnerIndex is { } oi && oi >= 0 && oi < memberIds.Count ? memberIds[oi] : null;
            await accounts.CreateAsync(new AccountInput(Kind: a.Kind, InstitutionKey: a.InstitutionKey, Name: a.Name, Currency: a.Currency,
                OwnerMemberId: owner, Joint: owner is null, Source: input.Source));
        }
        if (!await db.Categories.AnyAsync()) await Seed.ApplyCategoryTemplateAsync(db, input.Template);
        h.Settings.OnboardingDone = true;
        await db.SaveChangesAsync();
    }

    public static string? NormalizeEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var e = email.Trim().ToLowerInvariant();
        return EmailRegex().IsMatch(e) ? e : throw new DomainException($"Neplatný e-mail {email}.");
    }

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailRegex();

    /// <summary>Nevratně smaže všechna data domácnosti (kromě členů a připojení), průvodce začne znovu.</summary>
    public async Task DeleteAllDataAsync(string confirmName)
    {
        var h = await db.Households.FirstAsync();
        if (!string.Equals(confirmName?.Trim(), h.Name, StringComparison.Ordinal))
            throw new DomainException("Pro potvrzení opiš přesně název domácnosti.");
        db.TransactionEvents.RemoveRange(db.TransactionEvents);
        db.TransactionShares.RemoveRange(db.TransactionShares);
        db.TransactionSplits.RemoveRange(db.TransactionSplits);
        await db.SaveChangesAsync();
        db.Transactions.RemoveRange(db.Transactions);
        db.SkippedDuplicates.RemoveRange(db.SkippedDuplicates);
        await db.SaveChangesAsync();
        db.ImportBatches.RemoveRange(db.ImportBatches);
        db.RuleConditions.RemoveRange(db.RuleConditions);
        db.Rules.RemoveRange(db.Rules);
        db.RuleSuggestionDismissals.RemoveRange(db.RuleSuggestionDismissals);
        db.MemberBudgets.RemoveRange(db.MemberBudgets);
        db.RecurringSkips.RemoveRange(db.RecurringSkips);
        db.RecurringPayments.RemoveRange(db.RecurringPayments);
        db.InvestmentTrades.RemoveRange(db.InvestmentTrades);
        db.InvestmentValues.RemoveRange(db.InvestmentValues);
        db.Notifications.RemoveRange(db.Notifications);
        db.MemberPreferences.RemoveRange(db.MemberPreferences);
        await db.SaveChangesAsync();
        db.AccountConditions.RemoveRange(db.AccountConditions);
        db.AccountShares.RemoveRange(db.AccountShares);
        db.Accounts.RemoveRange(db.Accounts);
        await db.SaveChangesAsync();
        // Kategorie od listů ke kořenům (omezení na rodiče)
        while (await db.Categories.AnyAsync())
        {
            var leaves = await db.Categories.Where(c => !db.Categories.Any(x => x.ParentId == c.Id)).ToListAsync();
            db.Categories.RemoveRange(leaves);
            await db.SaveChangesAsync();
        }
        h.Settings.OnboardingDone = false;
        await db.SaveChangesAsync();
    }
}

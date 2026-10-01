using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record ConditionInput(ConditionType Type, decimal Target, string? Benefit);

public record AccountInput(
    AccountKind? Kind = null,
    string? InstitutionKey = null,
    string? Name = null,
    string? Iban = null,
    string? Currency = null,
    int? OwnerMemberId = null,
    bool? Joint = null,
    Dictionary<int, decimal>? Ratio = null,
    ShareRecalcMode? RatioMode = null,
    DateOnly? RatioFrom = null,
    bool? CardToHolder = null,
    decimal? LowBalanceLimit = null,
    bool? WatchLowBalance = null,
    decimal? InterestRate = null,
    InvestmentKind? InvestmentKind = null,
    int? FundingAccountId = null,
    ValueTracking? ValueTracking = null,
    AccountSource? Source = null,
    bool? IncludeInDisposable = null,
    bool? IncludeInNetWorth = null,
    decimal? OpeningBalance = null,
    DateOnly? OpeningDate = null,
    decimal? OpeningDeposits = null,
    List<ConditionInput>? Conditions = null);

/// <summary>Účty: založení, úprava, archivace, poměry společných účtů, podmínky, korekce zůstatku.</summary>
public class AccountService(AppDbContext db, ShareService shares, FxService fx, TimeProvider time)
{
    public async Task<Account> CreateAsync(AccountInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) throw new DomainException("Účet musí mít název.");
        var kind = input.Kind ?? AccountKind.Current;
        var currency = (input.Currency ?? "CZK").ToUpperInvariant();
        if (!FxService.Currencies.Contains(currency)) throw new DomainException($"Měna {currency} není podporovaná (CZK, EUR, USD).");
        var institution = input.InstitutionKey ?? (kind == AccountKind.Investment ? "othb" : "oth");
        if (!await db.Institutions.AnyAsync(i => i.Key == institution)) throw new DomainException($"Neznámá instituce {institution}.");
        var today = time.Today();
        var a = new Account
        {
            Kind = kind, InstitutionKey = institution, Name = input.Name.Trim(), Iban = Clean(input.Iban), Currency = currency,
            OpeningBalance = input.OpeningBalance ?? 0, OpeningDate = input.OpeningDate ?? today, OpeningDeposits = input.OpeningDeposits,
            CreatedAt = time.GetUtcNow(), SortOrder = (await db.Accounts.MaxAsync(x => (int?)x.SortOrder) ?? -1) + 1,
            IncludeInDisposable = kind != AccountKind.Investment, IncludeInNetWorth = true,
            Source = input.Source ?? AccountSource.Mcp,
        };
        await ApplyAsync(a, input, isNew: true);
        db.Accounts.Add(a);
        await db.SaveChangesAsync();
        if (a.IsJoint && a.Shares.Count == 0) await DefaultRatioAsync(a);
        return a;
    }

    public async Task<Account> UpdateAsync(int id, AccountInput input)
    {
        var a = await db.Accounts.Include(x => x.Shares).Include(x => x.Conditions).FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new DomainException($"Účet {id} neexistuje.");
        var hasTx = await db.Transactions.AnyAsync(t => t.AccountId == id);
        if (hasTx && input.Kind is { } k && k != a.Kind)
            throw new DomainException("Typ nelze u účtu s pohyby změnit. Založte nový účet a starý archivujte.");
        if (hasTx && input.Currency is { } c && !string.Equals(c, a.Currency, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Měnu nelze u účtu s pohyby změnit. Založte nový účet a starý archivujte.");
        if (input.Kind is { } kind) a.Kind = kind;
        if (input.Currency is { } cur) a.Currency = cur.ToUpperInvariant();
        if (input.Name is { } name)
        {
            if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Účet musí mít název.");
            a.Name = name.Trim();
        }
        if (input.InstitutionKey is { } ik)
        {
            if (!await db.Institutions.AnyAsync(i => i.Key == ik)) throw new DomainException($"Neznámá instituce {ik}.");
            a.InstitutionKey = ik;
        }
        if (input.Iban is not null) a.Iban = Clean(input.Iban);
        if (input.OpeningBalance is { } ob) a.OpeningBalance = ob;
        if (input.OpeningDate is { } od) a.OpeningDate = od;
        if (input.OpeningDeposits is { } odp) a.OpeningDeposits = odp;
        if (input.Source is { } src) a.Source = src;
        var owner = a.OwnerMemberId;
        await ApplyAsync(a, input, isNew: false);
        await db.SaveChangesAsync();
        if (a.IsJoint && a.Shares.Count == 0) await DefaultRatioAsync(a);
        // Jiný vlastník = jiné převody mezi členy
        if (a.OwnerMemberId != owner && hasTx) await TransferMatcher.ReclassifyAsync(db, a.Id);
        return a;
    }

    private async Task ApplyAsync(Account a, AccountInput input, bool isNew)
    {
        if (input.Joint == true) a.OwnerMemberId = null;
        else if (input.OwnerMemberId is { } owner)
        {
            if (!await db.Members.AnyAsync(m => m.Id == owner)) throw new DomainException($"Člen {owner} neexistuje.");
            var wasJoint = a.IsJoint && !isNew;
            a.OwnerMemberId = owner;
            if (wasJoint || isNew) a.Shares.Clear();
            if (!isNew)
            {
                // Vlastní účet: všechny ne-ručně přepsané pohyby patří vlastníkovi
                var txs = await db.Transactions.Include(t => t.Shares).Where(t => t.AccountId == a.Id && !t.SharesOverridden).ToListAsync();
                foreach (var t in txs) ShareService.Apply(t, [new TransactionShare { MemberId = owner, Percent = 100 }]);
            }
        }
        else if (isNew && input.Joint != true) throw new DomainException("Zadej vlastníka účtu, nebo ho označ jako společný.");

        if (input.CardToHolder is { } cth) a.CardToHolder = cth;
        if (input.WatchLowBalance == false) a.LowBalanceLimit = null;
        else if (input.LowBalanceLimit is { } lim) a.LowBalanceLimit = lim;
        if (input.InterestRate is { } ir) a.InterestRate = ir;
        if (input.InvestmentKind is { } ik) a.InvestmentKind = ik;
        if (input.FundingAccountId is { } fa) a.FundingAccountId = fa;
        if (input.ValueTracking is { } vt) a.ValueTracking = vt;
        if (input.IncludeInNetWorth is { } nw) a.IncludeInNetWorth = nw;
        if (input.IncludeInDisposable is { } disp) a.IncludeInDisposable = disp;
        if (a.Kind == AccountKind.Investment) a.IncludeInDisposable = false;
        if (input.Conditions is { } conds)
        {
            if (a.Kind == AccountKind.Investment && conds.Count > 0) throw new DomainException("Investiční účet nemá podmínky banky.");
            a.Conditions.Clear();
            var i = 0;
            foreach (var c in conds)
            {
                if (c.Target <= 0) throw new DomainException("Cílová hodnota podmínky musí být kladná.");
                a.Conditions.Add(new AccountCondition { Type = c.Type, Target = c.Target, Benefit = Clean(c.Benefit), SortOrder = i++ });
            }
        }
        if (a.IsJoint && input.Ratio is { Count: > 0 } ratio)
        {
            ShareService.Validate(ratio);
            if (isNew || a.Shares.Count == 0)
            {
                a.Shares.Clear();
                foreach (var (m, p) in ratio) a.Shares.Add(new AccountShare { MemberId = m, Percent = p, ValidFrom = DateOnly.MinValue });
            }
            else
            {
                await db.SaveChangesAsync();
                await shares.SetRatioAsync(a.Id, ratio, input.RatioMode ?? ShareRecalcMode.NewOnly, time.Today(), input.RatioFrom);
                await db.Entry(a).Collection(x => x.Shares).LoadAsync();
            }
        }
    }

    /// <summary>Společný účet bez zadaného poměru: rovným dílem mezi členy.</summary>
    private async Task DefaultRatioAsync(Account a)
    {
        var members = await db.Members.OrderBy(m => m.SortOrder).Select(m => m.Id).ToListAsync();
        if (members.Count == 0) return;
        var each = Math.Round(100m / members.Count, 2);
        for (var i = 0; i < members.Count; i++)
            a.Shares.Add(new AccountShare
            {
                MemberId = members[i], ValidFrom = DateOnly.MinValue,
                Percent = i == members.Count - 1 ? 100 - each * (members.Count - 1) : each,
            });
        await db.SaveChangesAsync();
    }

    public async Task ArchiveAsync(int id, bool archived = true)
    {
        var a = await db.Accounts.FindAsync(id) ?? throw new DomainException($"Účet {id} neexistuje.");
        a.Archived = archived;
        await db.SaveChangesAsync();
    }

    /// <summary>Pořadí účtů (seznamy, výběry účtu): zadané účty v daném pořadí, ostatní za nimi v dosavadním pořadí.</summary>
    public async Task ReorderAsync(IReadOnlyList<int> ids)
    {
        var all = await db.Accounts.OrderBy(a => a.SortOrder).ThenBy(a => a.Id).ToListAsync();
        var unknown = ids.Where(id => all.All(a => a.Id != id)).ToList();
        if (unknown.Count > 0) throw new DomainException($"Účet {unknown[0]} neexistuje.");
        if (ids.Distinct().Count() != ids.Count) throw new DomainException("Účet je v pořadí vícekrát.");
        var order = ids.Select(id => all.First(a => a.Id == id)).Concat(all.Where(a => !ids.Contains(a.Id))).ToList();
        for (var i = 0; i < order.Count; i++) order[i].SortOrder = i;
        await db.SaveChangesAsync();
    }

    /// <summary>Korekce zůstatku: zvláštní pohyb mimo statistiky, který srovná evidenci se skutečností.</summary>
    public async Task<Transaction> AddCorrectionAsync(int accountId, DateOnly date, decimal actualBalance, string actor)
    {
        var a = await db.Accounts.Include(x => x.Shares).FirstOrDefaultAsync(x => x.Id == accountId)
            ?? throw new DomainException($"Účet {accountId} neexistuje.");
        if (a.Kind == AccountKind.Investment)
            throw new DomainException("U investičního účtu se místo korekce zadává aktuální hodnota portfolia.");
        var current = await BalanceService.BalanceAtAsync(db, a, date);
        var diff = actualBalance - current;
        if (diff == 0) throw new DomainException("Zůstatek už odpovídá, korekce není potřeba.");
        var rate = await fx.RateAsync(a.Currency, date);
        var now = time.GetUtcNow();
        var t = new Transaction
        {
            AccountId = a.Id, Date = date, Amount = diff, Currency = a.Currency, FxRate = rate, AmountCzk = Math.Round(diff * rate, 2),
            Counterparty = "Korekce zůstatku", Kind = TransactionKind.Correction, ExcludeFromStats = true,
            Status = TransactionStatus.Confirmed, CategorySource = CategorySource.Manual, CreatedAt = now, ConfirmedAt = now,
            DedupKey = $"korekce|{a.Id}|{now.ToUnixTimeMilliseconds()}", Note = $"Nový zůstatek {actualBalance:0.##} {a.Currency}",
        };
        ShareService.Apply(t, ShareService.Compute(a, date, PaymentType.Other, null));
        t.Events.Add(new TransactionEvent { At = now, Actor = actor, Text = $"Korekce zůstatku na {actualBalance:0.##} {a.Currency}" });
        db.Transactions.Add(t);
        await db.SaveChangesAsync();
        return t;
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

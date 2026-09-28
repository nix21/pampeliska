using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum ShareRecalcMode { NewOnly, All, FromDate }

/// <summary>
/// Komu se pohyb připíše: vlastní účet → vlastník; společný účet → držitel karty (je-li zapnuto a známý),
/// jinak podle poměru účtu platného k datu platby. Ručně přepsané podíly se nepřepočítávají.
/// </summary>
public class ShareService(AppDbContext db)
{
    public static List<TransactionShare> Compute(Account account, DateOnly date, PaymentType paymentType, int? cardHolderMemberId)
    {
        if (account.OwnerMemberId is { } owner) return [new TransactionShare { MemberId = owner, Percent = 100 }];
        if (account.CardToHolder && paymentType == PaymentType.Card && cardHolderMemberId is { } holder)
            return [new TransactionShare { MemberId = holder, Percent = 100 }];
        return RatioAt(account, date).Select(kv => new TransactionShare { MemberId = kv.Key, Percent = kv.Value }).ToList();
    }

    /// <summary>Poměr společného účtu platný k datu (nejnovější záznam s ValidFrom ≤ datum, jinak nejstarší).</summary>
    public static Dictionary<int, decimal> RatioAt(Account account, DateOnly date)
    {
        if (account.Shares.Count == 0) return [];
        var dates = account.Shares.Select(s => s.ValidFrom).Distinct().OrderBy(d => d).ToList();
        var valid = dates.LastOrDefault(d => d <= date);
        if (valid == default) valid = dates[0];
        return account.Shares.Where(s => s.ValidFrom == valid).ToDictionary(s => s.MemberId, s => s.Percent);
    }

    public static void Apply(Transaction tx, IEnumerable<TransactionShare> shares)
    {
        // Úprava na místě – smazat a znovu přidat stejný klíč (pohyb, člen) v jednom SaveChanges EF neumí
        var target = shares.ToDictionary(s => s.MemberId, s => s.Percent);
        tx.Shares.RemoveAll(s => !target.ContainsKey(s.MemberId));
        foreach (var (member, pct) in target)
        {
            var existing = tx.Shares.FirstOrDefault(s => s.MemberId == member);
            if (existing is null) tx.Shares.Add(new TransactionShare { MemberId = member, Percent = pct });
            else existing.Percent = pct;
        }
    }

    /// <summary>
    /// Nový poměr společného účtu. <paramref name="mode"/>: NewOnly = platí od dnes, All = přepíše historii,
    /// FromDate = od zvoleného data. Pohyby s ručně přepsanými podíly zůstanou beze změny.
    /// </summary>
    public async Task<int> SetRatioAsync(int accountId, IReadOnlyDictionary<int, decimal> ratio, ShareRecalcMode mode, DateOnly today, DateOnly? from = null)
    {
        var account = await db.Accounts.Include(a => a.Shares).FirstOrDefaultAsync(a => a.Id == accountId)
            ?? throw new DomainException("Účet neexistuje.");
        if (!account.IsJoint) throw new DomainException("Poměr se nastavuje jen u společného účtu.");
        Validate(ratio);
        var validFrom = mode switch
        {
            ShareRecalcMode.All => DateOnly.MinValue,
            ShareRecalcMode.FromDate => from ?? throw new DomainException("Chybí datum, od kterého poměr platí."),
            _ => today,
        };
        if (mode == ShareRecalcMode.All) account.Shares.Clear();
        else account.Shares.RemoveAll(s => s.ValidFrom >= validFrom);
        foreach (var (member, pct) in ratio)
            account.Shares.Add(new AccountShare { MemberId = member, Percent = pct, ValidFrom = validFrom });
        await db.SaveChangesAsync();

        var txs = await db.Transactions.Include(t => t.Shares)
            .Where(t => t.AccountId == accountId && !t.SharesOverridden && t.Date >= validFrom).ToListAsync();
        foreach (var t in txs) Apply(t, Compute(account, t.Date, t.PaymentType, t.CardHolderMemberId));
        await db.SaveChangesAsync();
        return txs.Count;
    }

    public static void Validate(IReadOnlyDictionary<int, decimal> ratio)
    {
        if (ratio.Count == 0) throw new DomainException("Poměr musí obsahovat aspoň jednoho člena.");
        if (ratio.Values.Any(v => v < 0)) throw new DomainException("Podíl nesmí být záporný.");
        if (Math.Abs(ratio.Values.Sum() - 100) > 0.01m) throw new DomainException("Součet podílů musí být 100 %.");
    }
}

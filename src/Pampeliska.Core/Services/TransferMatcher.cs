using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>
/// Páruje převody mezi účty domácnosti: opačné znaménko, stejná částka (u různých měn ±3 % po přepočtu na Kč),
/// datum ±3 dny. Převod není výdaj ani příjem.
/// </summary>
public class TransferMatcher(AppDbContext db)
{
    public const int WindowDays = 3;
    public const decimal FxTolerance = 0.03m;

    public static bool AmountsMatch(Transaction a, Transaction b)
    {
        if (Math.Sign(a.Amount) == Math.Sign(b.Amount) || a.Amount == 0) return false;
        if (a.Currency == b.Currency) return Math.Abs(a.Amount + b.Amount) < 0.005m;
        var x = Math.Abs(a.AmountCzk);
        var y = Math.Abs(b.AmountCzk);
        return x > 0 && Math.Abs(x - y) <= x * FxTolerance;
    }

    /// <summary>Kandidáti na protějšek: jiný účet domácnosti, nespárované, ne ručně zařazené jako výdaj/příjem.</summary>
    public async Task<List<Transaction>> CandidatesAsync(Transaction t, IEnumerable<Transaction>? pending = null)
    {
        var from = t.Date.AddDays(-WindowDays);
        var to = t.Date.AddDays(WindowDays);
        var sign = Math.Sign(t.Amount);
        var fromDb = await db.Transactions
            .Where(u => u.AccountId != t.AccountId && u.Id != t.Id && u.TransferPairId == null && u.Date >= from && u.Date <= to
                        && (sign < 0 ? u.Amount > 0 : u.Amount < 0)
                        && u.Kind != TransactionKind.Correction && u.CategorySource != CategorySource.Manual)
            .ToListAsync();
        var all = fromDb.Concat((pending ?? []).Where(u => u.AccountId != t.AccountId && !ReferenceEquals(u, t) && u.TransferPairId == null
                                                            && u.Date >= from && u.Date <= to && u.Kind != TransactionKind.Correction))
            .Distinct().Where(u => AmountsMatch(t, u))
            .OrderBy(u => Math.Abs(u.Date.DayNumber - t.Date.DayNumber)).ToList();
        return all;
    }

    public static void Pair(Transaction a, Transaction b, Account accountA, Account accountB)
    {
        var kind = accountA.Kind == AccountKind.Investment || accountB.Kind == AccountKind.Investment
            ? TransactionKind.InvestmentTransfer : TransactionKind.Transfer;
        foreach (var (t, other) in new[] { (a, b), (b, a) })
        {
            t.Kind = kind;
            t.TransferPairId = other.Id == 0 ? null : other.Id;
            MarkTransfer(t);
        }
    }

    public static void MarkTransfer(Transaction t)
    {
        if (t.Kind is not (TransactionKind.Transfer or TransactionKind.InvestmentTransfer)) t.Kind = TransactionKind.Transfer;
        t.CategoryId = null;
        t.Splits.Clear();
        t.NeedOverride = null;
        t.AppliedRuleId = null;
        t.AiConfidence = null;
        t.AiReason = null;
        t.AiAlternatives = null;
        t.CategorySource = CategorySource.Auto;
        t.Status = TransactionStatus.Confirmed;
    }

    /// <summary>Po uložení (známe Id) doplní vzájemné odkazy u dvojic spárovaných v jedné dávce.</summary>
    public static void FixPairIds(IEnumerable<(Transaction A, Transaction B)> pairs)
    {
        foreach (var (a, b) in pairs)
        {
            a.TransferPairId = b.Id;
            b.TransferPairId = a.Id;
        }
    }

    /// <summary>Zruší párování – oba pohyby se vrátí mezi výdaje/příjmy a do fronty ke kategorizaci.</summary>
    public async Task UnpairAsync(int transactionId)
    {
        var t = await db.Transactions.FindAsync(transactionId) ?? throw new DomainException("Pohyb neexistuje.");
        var other = t.TransferPairId is { } pid ? await db.Transactions.FindAsync(pid) : null;
        foreach (var x in new[] { t, other }.OfType<Transaction>())
        {
            x.TransferPairId = null;
            x.Kind = x.Amount < 0 ? TransactionKind.Expense : TransactionKind.Income;
            x.CategorySource = null;
            x.Status = TransactionStatus.Suggested;
        }
        await db.SaveChangesAsync();
    }

    /// <summary>Ruční spárování dvou pohybů jako převodu.</summary>
    public async Task LinkAsync(int aId, int bId)
    {
        var a = await db.Transactions.Include(t => t.Splits).Include(t => t.Account).FirstOrDefaultAsync(t => t.Id == aId)
            ?? throw new DomainException("Pohyb neexistuje.");
        var b = await db.Transactions.Include(t => t.Splits).Include(t => t.Account).FirstOrDefaultAsync(t => t.Id == bId)
            ?? throw new DomainException("Pohyb neexistuje.");
        if (a.AccountId == b.AccountId) throw new DomainException("Převod musí být mezi dvěma různými účty.");
        if (Math.Sign(a.Amount) == Math.Sign(b.Amount)) throw new DomainException("Jeden pohyb musí být odchozí a druhý příchozí.");
        foreach (var x in new[] { a, b })
            if (x.TransferPairId is { } old && old != a.Id && old != b.Id)
                throw new DomainException($"Pohyb {x.Id} už je spárovaný s jiným převodem.");
        Pair(a, b, a.Account!, b.Account!);
        a.TransferPairId = b.Id;
        b.TransferPairId = a.Id;
        await db.SaveChangesAsync();
    }
}

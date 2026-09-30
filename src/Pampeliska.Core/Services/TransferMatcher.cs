using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>
/// Páruje převody mezi účty domácnosti: opačné znaménko, stejná částka (u různých měn ±3 % po přepočtu na Kč),
/// datum ±3 dny a doložený směr peněz (<see cref="FlowMatches"/>). Převod není výdaj ani příjem – kromě převodu mezi členy
/// v pohledu jednoho člena (<see cref="Transaction.BetweenMembers"/>).
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

    /// <summary>
    /// Odkud kam tečou peníze: protiúčet aspoň jedné strany je číslo druhého účtu, nebo jde o vklad na investiční účet
    /// z jeho zdrojového účtu. Známý protiúčet, který k druhému účtu nesedí, párování vylučuje – stejná částka nestačí.
    /// </summary>
    public static bool FlowMatches(Transaction a, Account accountA, Transaction b, Account accountB)
    {
        if (AccountNumber.Same(a.CounterpartyAccount, accountB.Iban) || AccountNumber.Same(b.CounterpartyAccount, accountA.Iban))
            return !Contradicts(a, accountB) && !Contradicts(b, accountA);
        // Investiční účet a jeho zdrojový účet: u zdrojové strany bývá protiúčtem sběrný účet brokera, u investiční se kontroluje
        if (accountB.Kind == AccountKind.Investment && accountB.FundingAccountId == accountA.Id) return !Contradicts(b, accountA);
        if (accountA.Kind == AccountKind.Investment && accountA.FundingAccountId == accountB.Id) return !Contradicts(a, accountB);
        return false;
    }

    /// <summary>Pohyb má známý protiúčet a účet známé číslo, ale neshodují se.</summary>
    private static bool Contradicts(Transaction t, Account other) =>
        AccountNumber.Normalize(t.CounterpartyAccount) is { } c && AccountNumber.Normalize(other.Iban) is { } o && c != o;

    /// <summary>Protějšky pro automatické párování: kandidáti s doloženým směrem peněz, nejbližší datum první.</summary>
    public async Task<List<Transaction>> MatchesAsync(Transaction t, Account account, IEnumerable<Transaction>? pending = null)
    {
        var all = await CandidatesAsync(t, pending, includeManual: true);
        var ids = all.Select(u => u.AccountId).Distinct().ToList();
        var accounts = await db.Accounts.AsNoTracking().Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id);
        // Ručně zařazený výdaj/příjem se páruje jen jako převod mezi členy – tam se kategorie zachová
        return all.Where(u => accounts.TryGetValue(u.AccountId, out var other) && FlowMatches(t, account, u, other)
                              && (u.CategorySource != CategorySource.Manual || AreBetweenMembers(account, other))).ToList();
    }

    /// <summary>
    /// Kandidáti na protějšek podle částky a data (nabídka pro ruční spárování): jiný účet domácnosti, nespárované,
    /// ne ručně zařazené jako výdaj/příjem. Nejbližší datum první.
    /// </summary>
    public async Task<List<Transaction>> CandidatesAsync(Transaction t, IEnumerable<Transaction>? pending = null, bool includeManual = false)
    {
        var from = t.Date.AddDays(-WindowDays);
        var to = t.Date.AddDays(WindowDays);
        var sign = Math.Sign(t.Amount);
        var fromDb = await db.Transactions.Include(u => u.Splits)
            .Where(u => u.AccountId != t.AccountId && u.Id != t.Id && u.TransferPairId == null && u.Date >= from && u.Date <= to
                        && (sign < 0 ? u.Amount > 0 : u.Amount < 0)
                        && u.Kind != TransactionKind.Correction && (includeManual || u.CategorySource != CategorySource.Manual))
            .ToListAsync();
        var all = fromDb.Concat((pending ?? []).Where(u => u.AccountId != t.AccountId && !ReferenceEquals(u, t) && u.TransferPairId == null
                                                            && u.Date >= from && u.Date <= to && u.Kind != TransactionKind.Correction))
            .Distinct().Where(u => AmountsMatch(t, u))
            .OrderBy(u => Math.Abs(u.Date.DayNumber - t.Date.DayNumber)).ToList();
        return all;
    }

    public static void Pair(Transaction a, Transaction b, Account accountA, Account accountB)
    {
        foreach (var (t, other, account, counter) in new[] { (a, b, accountA, accountB), (b, a, accountB, accountA) })
        {
            t.TransferPairId = other.Id == 0 ? null : other.Id;
            MarkTransfer(t, account, counter);
        }
    }

    /// <summary>Oba účty patří každý jinému členovi (společný ani investiční účet ne).</summary>
    public static bool AreBetweenMembers(Account a, Account b) =>
        a.OwnerMemberId is { } x && b.OwnerMemberId is { } y && x != y
        && a.Kind != AccountKind.Investment && b.Kind != AccountKind.Investment;

    /// <summary>
    /// Označí pohyb na <paramref name="account"/> jako převod s protiúčtem <paramref name="counter"/>. Převod mezi členy si kategorii
    /// nechá a bez ní čeká ve frontě ke kategorizaci; ostatní převody se nekategorizují.
    /// </summary>
    public static void MarkTransfer(Transaction t, Account account, Account counter)
    {
        t.Kind = account.Kind == AccountKind.Investment || counter.Kind == AccountKind.Investment
            ? TransactionKind.InvestmentTransfer : TransactionKind.Transfer;
        t.TransferAccountId = counter.Id == 0 ? null : counter.Id;
        t.BetweenMembers = AreBetweenMembers(account, counter);
        if (t.BetweenMembers)
        {
            if (!t.IsCategorized)
            {
                t.CategorySource = null;
                t.Status = TransactionStatus.Suggested;
                t.ConfirmedAt = null;
            }
            return;
        }
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

    /// <summary>
    /// Převod mezi členy: ještě nezařazené straně <paramref name="to"/> předvyplní kategorii (nebo rozdělení) protějšku jako návrh.
    /// Každá strana má kategorii vlastní, tohle jen šetří práci. Vrací true, když se něco změnilo.
    /// </summary>
    public static bool PrefillFromPair(Transaction from, Transaction to, DateTimeOffset now)
    {
        if (!from.BetweenMembers || !to.BetweenMembers || !from.IsCategorized || to.IsCategorized || to.Status == TransactionStatus.Confirmed)
            return false;
        if (from.IsSplit)
        {
            var ratio = to.Amount / from.Amount;
            var parts = from.Splits.OrderBy(s => s.SortOrder).ToList();
            var rest = to.Amount;
            for (var i = 0; i < parts.Count; i++)
            {
                var amount = i == parts.Count - 1 ? rest : Math.Round(parts[i].Amount * ratio, 2);
                rest -= amount;
                to.Splits.Add(new TransactionSplit { CategoryId = parts[i].CategoryId, Amount = amount, NeedOverride = parts[i].NeedOverride, SortOrder = i });
            }
        }
        else to.CategoryId = from.CategoryId;
        to.NeedOverride = from.NeedOverride;
        to.CategorySource = CategorySource.Auto;
        to.Events.Add(new TransactionEvent { At = now, Actor = "Pampeliška", Text = "Kategorie podle protějšku převodu" });
        return true;
    }

    /// <summary>Zrušení převodu (rozpárování, smazání protějšku): pohyb se vrátí mezi výdaje/příjmy a do fronty.</summary>
    public static void Unmark(Transaction t)
    {
        t.TransferPairId = null;
        t.TransferAccountId = null;
        t.BetweenMembers = false;
        t.Kind = t.Amount < 0 ? TransactionKind.Expense : TransactionKind.Income;
        if (!t.IsCategorized) t.CategorySource = null;
        t.Status = TransactionStatus.Suggested;
        t.ConfirmedAt = null;
    }

    /// <summary>
    /// Znovu určí protiúčet a „převod mezi členy“ (po změně vlastníka účtu; při startu u starších převodů bez protiúčtu).
    /// </summary>
    public static async Task ReclassifyAsync(AppDbContext db, int? accountId = null)
    {
        var q = db.Transactions.Include(t => t.Splits)
            .Where(t => t.Kind == TransactionKind.Transfer || t.Kind == TransactionKind.InvestmentTransfer);
        q = accountId is { } id ? q.Where(t => t.AccountId == id || t.TransferAccountId == id) : q.Where(t => t.TransferAccountId == null);
        var txs = await q.ToListAsync();
        if (txs.Count == 0) return;
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id);
        var pairIds = txs.Where(t => t.TransferPairId != null).Select(t => t.TransferPairId!.Value).ToList();
        var pairAccounts = await db.Transactions.AsNoTracking().Where(t => pairIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.AccountId);
        foreach (var t in txs)
        {
            if (!accounts.TryGetValue(t.AccountId, out var account)) continue;
            var counterId = t.TransferPairId is { } p && pairAccounts.TryGetValue(p, out var pa) ? pa
                : t.TransferAccountId ?? accounts.Values.FirstOrDefault(a => a.Id != t.AccountId && AccountNumber.Same(a.Iban, t.CounterpartyAccount))?.Id;
            if (counterId is { } c && accounts.TryGetValue(c, out var counter)) MarkTransfer(t, account, counter);
        }
        await db.SaveChangesAsync();
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
        var t = await db.Transactions.Include(x => x.Splits).FirstOrDefaultAsync(x => x.Id == transactionId) ?? throw new DomainException("Pohyb neexistuje.");
        var other = t.TransferPairId is { } pid ? await db.Transactions.Include(x => x.Splits).FirstOrDefaultAsync(x => x.Id == pid) : null;
        foreach (var x in new[] { t, other }.OfType<Transaction>()) Unmark(x);
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

using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum ConditionState { Met, Pending, Urgent }

public record ConditionStatus(int ConditionId, int AccountId, ConditionType Type, decimal Target, decimal Current, string? Benefit,
    ConditionState State, int DaysLeft, DateOnly PeriodEnd, decimal Missing);

public record ConditionsSummary(int Met, int Total, ConditionState Worst, int DaysLeft, IReadOnlyList<ConditionStatus> Items);

/// <summary>
/// Podmínky bank za kalendářní měsíc. Příchozí platby nezahrnují převody z vlastních účtů u stejné instituce
/// (převod z jiné banky se počítá). Karetní platby = odchozí s typem Card. Stav: splněno / víc než 7 dní / 7 a méně dní.
/// </summary>
public class ConditionService(AppDbContext db, TimeProvider time)
{
    public const int UrgentDays = 7;

    public async Task<ConditionsSummary> EvaluateAsync(int? accountId = null, DateOnly? month = null, int? memberId = null)
    {
        var today = time.Today();
        var range = DateRange.MonthOf(month ?? today);
        var accounts = await db.Accounts.AsNoTracking().Include(a => a.Conditions).Where(a => !a.Archived).ToListAsync();
        var byId = accounts.ToDictionary(a => a.Id);
        var targets = accounts.Where(a => a.Conditions.Count > 0 && (accountId == null || a.Id == accountId)
                                          && (memberId == null || a.OwnerMemberId == memberId || a.IsJoint)).ToList();
        var ids = targets.Select(a => a.Id).ToList();
        var txs = await db.Transactions.AsNoTracking().Where(t => ids.Contains(t.AccountId) && t.Date <= range.To).ToListAsync();
        var pairIds = txs.Where(t => t.TransferPairId != null).Select(t => t.TransferPairId!.Value).ToList();
        var pairAccount = await db.Transactions.AsNoTracking().Where(t => pairIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.AccountId);
        var daysLeft = Math.Max(0, range.To.DayNumber - today.DayNumber);
        var items = new List<ConditionStatus>();
        foreach (var a in targets)
        {
            var month_ = txs.Where(t => t.AccountId == a.Id && range.Contains(t.Date)).ToList();
            foreach (var c in a.Conditions.OrderBy(c => c.SortOrder))
            {
                var current = c.Type switch
                {
                    ConditionType.IncomingSum => month_.Where(t => t.Amount > 0 && CountsAsIncoming(t, a, byId, pairAccount)).Sum(t => t.Amount),
                    ConditionType.CardCount => month_.Count(t => t.Amount < 0 && t.PaymentType == PaymentType.Card),
                    _ => AverageBalance(a, txs.Where(t => t.AccountId == a.Id).Select(t => (t.Date, t.Amount)).ToList(),
                        new DateRange(range.From, today < range.To && today >= range.From ? today : range.To)),
                };
                var met = current >= c.Target;
                var state = met ? ConditionState.Met : daysLeft <= UrgentDays ? ConditionState.Urgent : ConditionState.Pending;
                items.Add(new ConditionStatus(c.Id, a.Id, c.Type, c.Target, Math.Round(current, 2), c.Benefit, state, daysLeft, range.To,
                    met ? 0 : c.Target - current));
            }
        }
        var worst = items.Count == 0 ? ConditionState.Met : items.Max(i => i.State);
        return new ConditionsSummary(items.Count(i => i.State == ConditionState.Met), items.Count, worst, daysLeft, items);
    }

    public static bool CountsAsIncoming(Transaction t, Account target, IReadOnlyDictionary<int, Account> accounts, IReadOnlyDictionary<int, int> pairAccount)
    {
        if (t.Kind is TransactionKind.Income or TransactionKind.Refund) return true;
        if (t.Kind is not (TransactionKind.Transfer or TransactionKind.InvestmentTransfer)) return false;
        // Převod z vlastního účtu: počítá se jen z jiné instituce
        if (t.TransferPairId is { } p && pairAccount.TryGetValue(p, out var srcId) && accounts.TryGetValue(srcId, out var src))
            return src.InstitutionKey != target.InstitutionKey;
        var own = accounts.Values.FirstOrDefault(x => AccountNumber.Same(x.Iban, t.CounterpartyAccount));
        if (own is not null) return own.InstitutionKey != target.InstitutionKey;
        var bank = AccountNumber.BankCode(t.CounterpartyAccount);
        var targetBank = AccountNumber.BankCode(target.Iban);
        return bank is null || targetBank is null || bank != targetBank;
    }

    public static decimal AverageBalance(Account a, IReadOnlyList<(DateOnly Date, decimal Amount)> txs, DateRange range)
    {
        if (range.To < range.From) return 0;
        var daily = BalanceService.DailyBalances(a, txs, range);
        return daily.Count == 0 ? 0 : daily.Average();
    }
}

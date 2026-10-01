using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record ValuePoint(DateOnly Date, decimal Value, decimal Deposits);
public record Position(string Ticker, string? Name, decimal Quantity, decimal LastPrice, decimal Value, string Currency);
public record TradeDto(int Id, DateOnly Date, TradeSide Side, string Ticker, string? Name, decimal Quantity, decimal Price, string Currency,
    decimal Total, int? LinkedTransactionId, string? LinkedLabel);

public record InvestmentAccountView(int AccountId, decimal Value, decimal Deposits, decimal Gain, decimal? GainPct, decimal? ChangeSinceLast,
    DateOnly? LastDate, DateOnly? PrevDate, IReadOnlyList<ValuePoint> History, IReadOnlyList<Position> Positions, decimal Cash,
    IReadOnlyList<TradeDto> Trades);

public record NetWorthLayer(string Key, IReadOnlyList<decimal> Values);
public record NetWorth(IReadOnlyList<string> Months, IReadOnlyList<NetWorthLayer> Layers, decimal Now, decimal MonthAgo, decimal YearAgo,
    IReadOnlyDictionary<string, decimal> Rates);

public record TradeInput(int AccountId, DateOnly Date, TradeSide Side, string Ticker, string? Name, decimal Quantity, decimal Price, string? Currency,
    int? LinkedTransactionId);

/// <summary>Investice: ručně zadávaná hodnota, vklady (převody na investiční účet), obchody a pozice; čisté jmění po vrstvách.</summary>
public class InvestmentService(AppDbContext db, FxService fx, TimeProvider time)
{
    /// <summary>Vklady k datu: počáteční „vloženo celkem“ + příchozí převody na účet (mínus odchozí).</summary>
    public static decimal DepositsAt(Account a, IEnumerable<Transaction> txs, DateOnly date) =>
        (a.OpeningDeposits ?? 0) + txs.Where(t => t.AccountId == a.Id && t.Date <= date && t.Date > a.OpeningDate
                                                  && (t.Kind is TransactionKind.InvestmentTransfer or TransactionKind.Transfer)).Sum(t => t.Amount);

    public async Task<List<InvestmentAccountView>> AccountsAsync()
    {
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.Kind == AccountKind.Investment && !a.Archived).ToListAsync();
        var ids = accounts.Select(a => a.Id).ToList();
        var values = (await db.InvestmentValues.AsNoTracking().Where(v => ids.Contains(v.AccountId)).OrderBy(v => v.Date).ToListAsync()).ToLookup(v => v.AccountId);
        var txs = await db.Transactions.AsNoTracking().Where(t => ids.Contains(t.AccountId)).ToListAsync();
        var trades = (await db.InvestmentTrades.AsNoTracking().Where(t => ids.Contains(t.AccountId)).OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).ToListAsync())
            .ToLookup(t => t.AccountId);
        var linkedIds = trades.SelectMany(g => g).Where(t => t.LinkedTransactionId != null).Select(t => t.LinkedTransactionId!.Value).ToList();
        var linked = await db.Transactions.AsNoTracking().Include(t => t.Account).Where(t => linkedIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id);
        return accounts.Select(a =>
        {
            var vals = values[a.Id].ToList();
            var history = new List<ValuePoint> { new(a.OpeningDate, a.OpeningBalance, a.OpeningDeposits ?? 0) };
            history.AddRange(vals.Select(v => new ValuePoint(v.Date, v.Value, DepositsAt(a, txs, v.Date))));
            history = history.GroupBy(h => h.Date).Select(g => g.Last()).OrderBy(h => h.Date).ToList();
            var last = history[^1];
            var prev = history.Count > 1 ? history[^2] : null;
            var deposits = DepositsAt(a, txs, time.Today());
            var positions = Positions(trades[a.Id]);
            var gain = last.Value - deposits;
            return new InvestmentAccountView(a.Id, last.Value, deposits, gain, deposits > 0 ? Math.Round(gain / deposits * 100, 1) : null,
                prev is null ? null : last.Value - prev.Value, last.Date, prev?.Date, history, positions, last.Value - positions.Sum(p => p.Value),
                trades[a.Id].Select(t => new TradeDto(t.Id, t.Date, t.Side, t.Ticker, t.Name, t.Quantity, t.Price, t.Currency,
                    Math.Round(t.Quantity * t.Price, 2) * (t.Side == TradeSide.Buy ? -1 : 1), t.LinkedTransactionId,
                    t.LinkedTransactionId is { } l && linked.TryGetValue(l, out var lt) ? $"Převod {Math.Abs(lt.Amount):N0} {lt.Currency} z účtu {lt.Account?.Name} · {lt.Date:d. M.}" : null)).ToList());
        }).ToList();
    }

    public static List<Position> Positions(IEnumerable<InvestmentTrade> trades) =>
        trades.GroupBy(t => t.Ticker.ToUpperInvariant())
            .Select(g =>
            {
                var qty = g.Sum(t => t.Side == TradeSide.Buy ? t.Quantity : -t.Quantity);
                var last = g.OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).First();
                return new Position(g.Key, g.Select(t => t.Name).FirstOrDefault(n => !string.IsNullOrEmpty(n)), qty, last.Price, Math.Round(qty * last.Price, 2), last.Currency);
            })
            .Where(p => p.Quantity > 0).OrderByDescending(p => p.Value).ToList();

    public async Task AddValueAsync(int accountId, DateOnly date, decimal value)
    {
        var a = await db.Accounts.FindAsync(accountId) ?? throw new DomainException($"Účet {accountId} neexistuje.");
        if (a.Kind != AccountKind.Investment) throw new DomainException("Hodnota se zadává jen u investičního účtu.");
        if (value < 0) throw new DomainException("Hodnota nesmí být záporná.");
        var existing = await db.InvestmentValues.FirstOrDefaultAsync(v => v.AccountId == accountId && v.Date == date);
        if (existing is null) db.InvestmentValues.Add(new InvestmentValue { AccountId = accountId, Date = date, Value = value });
        else existing.Value = value;
        await db.SaveChangesAsync();
    }

    public async Task<InvestmentTrade> AddTradeAsync(TradeInput input)
    {
        var a = await db.Accounts.FindAsync(input.AccountId) ?? throw new DomainException($"Účet {input.AccountId} neexistuje.");
        if (a.Kind != AccountKind.Investment) throw new DomainException("Obchody se evidují jen u investičního účtu.");
        if (input.Quantity <= 0 || input.Price <= 0) throw new DomainException("Počet kusů i cena musí být kladné.");
        if (string.IsNullOrWhiteSpace(input.Ticker)) throw new DomainException("Zadej ticker.");
        var t = new InvestmentTrade
        {
            AccountId = a.Id, Date = input.Date, Side = input.Side, Ticker = input.Ticker.Trim().ToUpperInvariant(), Name = input.Name?.Trim(),
            Quantity = input.Quantity, Price = input.Price, Currency = (input.Currency ?? a.Currency).ToUpperInvariant(), LinkedTransactionId = input.LinkedTransactionId,
        };
        // Nákup: navázat na dosud nenavázaný vklad na tento účet v okně ±5 dní (i bez naimportované strany investičního účtu)
        if (t.LinkedTransactionId is null && t.Side == TradeSide.Buy)
        {
            var used = await db.InvestmentTrades.Where(x => x.LinkedTransactionId != null).Select(x => x.LinkedTransactionId!.Value).ToListAsync();
            var from = t.Date.AddDays(-5);
            var to = t.Date.AddDays(1);
            var candidate = await db.Transactions.AsNoTracking()
                .Where(x => x.Kind == TransactionKind.InvestmentTransfer && x.Amount < 0 && x.Date >= from && x.Date <= to && !used.Contains(x.Id)
                            && x.TransferAccountId == a.Id)
                .OrderBy(x => x.Date).FirstOrDefaultAsync();
            t.LinkedTransactionId = candidate?.Id;
        }
        db.InvestmentTrades.Add(t);
        await db.SaveChangesAsync();
        return t;
    }

    public async Task DeleteTradeAsync(int id)
    {
        var t = await db.InvestmentTrades.FindAsync(id) ?? throw new DomainException($"Obchod {id} neexistuje.");
        db.InvestmentTrades.Remove(t);
        await db.SaveChangesAsync();
    }

    /// <summary>Čisté jmění po měsících (konec měsíce) ve vrstvách: běžné, spořicí, cizí měny, investice. V CZK.</summary>
    public async Task<NetWorth> NetWorthAsync(int months = 12, int? memberId = null)
    {
        var today = time.Today();
        var accounts = await db.Accounts.AsNoTracking().Include(a => a.Shares).Where(a => !a.Archived && a.IncludeInNetWorth).ToListAsync();
        if (memberId is { } m) accounts = accounts.Where(a => a.OwnerMemberId == m || a.IsJoint).ToList();
        var ids = accounts.Select(a => a.Id).ToList();
        var txs = (await db.Transactions.AsNoTracking().Where(t => ids.Contains(t.AccountId)).Select(t => new { t.AccountId, t.Date, t.Amount }).ToListAsync())
            .ToLookup(t => t.AccountId, t => (t.Date, t.Amount));
        var values = (await db.InvestmentValues.AsNoTracking().Where(v => ids.Contains(v.AccountId)).ToListAsync()).ToLookup(v => v.AccountId);
        // Měsíce před začátkem evidence (nejstarší počáteční zůstatek) se nezobrazují – jinak by graf „skočil“ při založení účtů
        var firstDate = accounts.Count == 0 ? today : accounts.Min(a => a.OpeningDate);
        var points = Enumerable.Range(0, months).Select(i =>
        {
            var d = new DateOnly(today.Year, today.Month, 1).AddMonths(i - months + 1);
            return i == months - 1 ? today : d.AddMonths(1).AddDays(-1);
        }).Where(d => d >= firstDate || d == today).ToList();
        months = points.Count;
        var layers = new Dictionary<string, decimal[]> { ["Current"] = new decimal[months], ["Savings"] = new decimal[months], ["Foreign"] = new decimal[months], ["Investment"] = new decimal[months] };
        for (var i = 0; i < points.Count; i++)
        {
            var d = points[i];
            foreach (var a in accounts)
            {
                var bal = a.Kind == AccountKind.Investment
                    ? values[a.Id].Where(v => v.Date <= d).OrderByDescending(v => v.Date).FirstOrDefault()?.Value ?? (a.OpeningDate <= d ? a.OpeningBalance : 0)
                    : BalanceService.BalanceFrom(a, txs[a.Id], d);
                var rate = await fx.RateAsync(a.Currency, d);
                var weight = memberId is { } mm && a.IsJoint ? ShareService.RatioAt(a, d).GetValueOrDefault(mm) / 100m : 1m;
                var key = AccountQueries.GroupOf(a).ToString();
                layers[key][i] += Math.Round(bal * rate * weight, 2);
            }
        }
        var totals = Enumerable.Range(0, months).Select(i => layers.Values.Sum(l => l[i])).ToList();
        return new NetWorth(points.Select(p => $"{p:yyyy-MM}").ToList(), layers.Select(kv => new NetWorthLayer(kv.Key, kv.Value)).ToList(),
            totals[^1], months > 1 ? totals[^2] : totals[^1], totals[0], await fx.LatestAsync(today));
    }
}

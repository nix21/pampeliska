using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public enum AccountGroup { Current, Savings, Foreign, Investment }

public record InstitutionDto(string Key, string Name, string Abbrev, string Color, InstitutionKind Kind);

public record ShareDto(int MemberId, decimal Percent);

public record ConditionDto(int Id, ConditionType Type, decimal Target, string? Benefit);

public record AccountSummary(
    int Id, AccountKind Kind, AccountGroup Group, string Name, InstitutionDto Institution, string? Iban, string Currency,
    int? OwnerMemberId, bool Joint, IReadOnlyList<ShareDto> Ratio, bool CardToHolder,
    decimal Balance, decimal BalanceCzk, IReadOnlyList<decimal> Sparkline, AccountSource Source, DateTimeOffset? LastImportAt,
    decimal? LowBalanceLimit, decimal? InterestRate, InvestmentKind? InvestmentKind, int? FundingAccountId, ValueTracking ValueTracking,
    bool IncludeInDisposable, bool IncludeInNetWorth, decimal OpeningBalance, DateOnly OpeningDate, decimal? OpeningDeposits,
    bool Archived, IReadOnlyList<ConditionDto> Conditions, int TransactionCount);

/// <summary>Čtecí pohled na účty (web i MCP).</summary>
public class AccountQueries(AppDbContext db, BalanceService balances, TimeProvider time)
{
    public static AccountGroup GroupOf(Account a) => a.Kind switch
    {
        AccountKind.Investment => AccountGroup.Investment,
        AccountKind.Savings => AccountGroup.Savings,
        _ => a.Currency == "CZK" ? AccountGroup.Current : AccountGroup.Foreign,
    };

    public static InstitutionDto ToDto(Institution i) => new(i.Key, i.Name, i.Abbrev, i.Color, i.Kind);

    public async Task<List<InstitutionDto>> InstitutionsAsync() =>
        (await db.Institutions.AsNoTracking().OrderBy(i => i.SortOrder).ToListAsync()).Select(ToDto).ToList();

    public async Task<List<AccountSummary>> ListAsync(bool includeArchived = false, bool sparklines = true)
    {
        var accounts = await db.Accounts.AsNoTracking().Include(a => a.Institution).Include(a => a.Shares).Include(a => a.Conditions)
            .Where(a => includeArchived || !a.Archived).OrderBy(a => a.SortOrder).ThenBy(a => a.Id).ToListAsync();
        var bal = await balances.BalancesAsync(includeArchived: includeArchived);
        var stats = (await db.Transactions.AsNoTracking().GroupBy(t => t.AccountId)
                .Select(g => new { g.Key, Count = g.Count(), Last = g.Max(t => (DateTimeOffset?)t.CreatedAt) }).ToListAsync())
            .ToDictionary(x => x.Key);
        var today = time.Today();
        var result = new List<AccountSummary>();
        foreach (var a in accounts)
        {
            var spark = sparklines ? (await balances.WeeklySeriesAsync(a)).Select(p => p.Balance).ToList() : [];
            var b = bal.GetValueOrDefault(a.Id);
            var ratio = a.IsJoint ? ShareService.RatioAt(a, today).Select(kv => new ShareDto(kv.Key, kv.Value)).ToList() : [];
            result.Add(new AccountSummary(a.Id, a.Kind, GroupOf(a), a.Name, ToDto(a.Institution!), a.Iban, a.Currency,
                a.OwnerMemberId, a.IsJoint, ratio, a.CardToHolder, b?.Balance ?? a.OpeningBalance, b?.BalanceCzk ?? a.OpeningBalance, spark,
                a.Source, stats.GetValueOrDefault(a.Id)?.Last, a.LowBalanceLimit, a.InterestRate, a.InvestmentKind, a.FundingAccountId,
                a.ValueTracking, a.IncludeInDisposable, a.IncludeInNetWorth, a.OpeningBalance, a.OpeningDate, a.OpeningDeposits, a.Archived,
                a.Conditions.OrderBy(c => c.SortOrder).Select(c => new ConditionDto(c.Id, c.Type, c.Target, c.Benefit)).ToList(),
                stats.GetValueOrDefault(a.Id)?.Count ?? 0));
        }
        return result;
    }

    public async Task<AccountSummary> GetAsync(int id) =>
        (await ListAsync(includeArchived: true)).FirstOrDefault(a => a.Id == id) ?? throw new DomainException($"Účet {id} neexistuje.");
}

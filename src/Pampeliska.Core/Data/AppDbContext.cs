using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Household> Households => Set<Household>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<MemberPreference> MemberPreferences => Set<MemberPreference>();
    public DbSet<Institution> Institutions => Set<Institution>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<AccountShare> AccountShares => Set<AccountShare>();
    public DbSet<AccountCondition> AccountConditions => Set<AccountCondition>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<SkippedDuplicate> SkippedDuplicates => Set<SkippedDuplicate>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<TransactionSplit> TransactionSplits => Set<TransactionSplit>();
    public DbSet<TransactionShare> TransactionShares => Set<TransactionShare>();
    public DbSet<TransactionEvent> TransactionEvents => Set<TransactionEvent>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<MemberBudget> MemberBudgets => Set<MemberBudget>();
    public DbSet<Rule> Rules => Set<Rule>();
    public DbSet<RuleCondition> RuleConditions => Set<RuleCondition>();
    public DbSet<RuleSuggestionDismissal> RuleSuggestionDismissals => Set<RuleSuggestionDismissal>();
    public DbSet<RecurringPayment> RecurringPayments => Set<RecurringPayment>();
    public DbSet<RecurringSkip> RecurringSkips => Set<RecurringSkip>();
    public DbSet<InvestmentValue> InvestmentValues => Set<InvestmentValue>();
    public DbSet<InvestmentTrade> InvestmentTrades => Set<InvestmentTrade>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<BackupRun> BackupRuns => Set<BackupRun>();

    public DbSet<OAuthClient> OAuthClients => Set<OAuthClient>();
    public DbSet<OAuthAuthorizationCode> OAuthAuthorizationCodes => Set<OAuthAuthorizationCode>();
    public DbSet<OAuthGrant> OAuthGrants => Set<OAuthGrant>();
    public DbSet<OAuthToken> OAuthTokens => Set<OAuthToken>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<decimal>().HavePrecision(18, 4);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Household>(e => e.OwnsOne(h => h.Settings));

        b.Entity<Member>(e =>
        {
            e.HasIndex(m => m.Email).IsUnique();
            e.Property(m => m.Email).HasMaxLength(320);
        });
        b.Entity<MemberPreference>().HasIndex(p => new { p.MemberId, p.Key }).IsUnique();

        b.Entity<Institution>(e =>
        {
            e.HasKey(i => i.Key);
            e.Property(i => i.Key).HasMaxLength(32);
        });

        b.Entity<Account>(e =>
        {
            e.HasOne(a => a.Institution).WithMany().HasForeignKey(a => a.InstitutionKey).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(a => a.OwnerMember).WithMany().HasForeignKey(a => a.OwnerMemberId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(a => a.Shares).WithOne().HasForeignKey(s => s.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(a => a.Conditions).WithOne().HasForeignKey(c => c.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Currency).HasMaxLength(3);
        });
        b.Entity<AccountShare>().HasIndex(s => new { s.AccountId, s.ValidFrom });

        b.Entity<ImportBatch>(e =>
        {
            e.HasMany(x => x.SkippedDuplicates).WithOne().HasForeignKey(s => s.BatchId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<Transaction>(e =>
        {
            e.HasOne(t => t.Account).WithMany().HasForeignKey(t => t.AccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.Batch).WithMany().HasForeignKey(t => t.BatchId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.Category).WithMany().HasForeignKey(t => t.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(t => t.Splits).WithOne().HasForeignKey(s => s.TransactionId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(t => t.Shares).WithOne().HasForeignKey(s => s.TransactionId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(t => t.Events).WithOne().HasForeignKey(s => s.TransactionId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(t => new { t.AccountId, t.Date });
            e.HasIndex(t => t.Date);
            e.HasIndex(t => t.DedupKey);
            e.HasIndex(t => t.ExternalId);
            e.HasIndex(t => t.Status);
            e.Property(t => t.Currency).HasMaxLength(3);
        });
        b.Entity<TransactionSplit>().HasOne(s => s.Category).WithMany().HasForeignKey(s => s.CategoryId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TransactionShare>().HasKey(s => new { s.TransactionId, s.MemberId });

        b.Entity<Category>(e =>
        {
            e.HasOne(c => c.Parent).WithMany(c => c.Children).HasForeignKey(c => c.ParentId).OnDelete(DeleteBehavior.Restrict);
        });
        b.Entity<MemberBudget>().HasIndex(m => new { m.CategoryId, m.MemberId }).IsUnique();

        b.Entity<Rule>(e =>
        {
            e.HasOne(r => r.Category).WithMany().HasForeignKey(r => r.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(r => r.Conditions).WithOne().HasForeignKey(c => c.RuleId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(r => r.Priority);
        });

        b.Entity<RecurringPayment>().HasIndex(r => r.AccountId);
        b.Entity<RecurringSkip>().HasIndex(r => new { r.RecurringPaymentId, r.DueDate }).IsUnique();
        b.Entity<InvestmentValue>().HasIndex(v => new { v.AccountId, v.Date });
        b.Entity<InvestmentTrade>().HasIndex(v => new { v.AccountId, v.Date });
        b.Entity<ExchangeRate>().HasIndex(r => new { r.Date, r.Currency }).IsUnique();
        b.Entity<Notification>().HasIndex(n => n.Key);

        // OAuth pro MCP – explicitní názvy tabulek (snake_case by z "OAuth" udělal "o_auth")
        b.Entity<OAuthClient>(e =>
        {
            e.ToTable("oauth_clients");
            e.Property(c => c.Id).HasMaxLength(64);
            e.Property(c => c.Name).HasMaxLength(100);
        });
        b.Entity<OAuthAuthorizationCode>(e =>
        {
            e.ToTable("oauth_authorization_codes");
            e.HasIndex(c => c.CodeHash).IsUnique();
            e.HasIndex(c => c.ExpiresAt);
        });
        b.Entity<OAuthGrant>(e =>
        {
            e.ToTable("oauth_grants");
            e.HasOne(g => g.Client).WithMany().HasForeignKey(g => g.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(g => g.Tokens).WithOne(t => t.Grant).HasForeignKey(t => t.GrantId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<OAuthToken>(e =>
        {
            e.ToTable("oauth_tokens");
            e.HasIndex(t => t.Hash).IsUnique();
            e.HasIndex(t => t.ExpiresAt);
        });
    }
}

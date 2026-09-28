using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Pampeliska.Core;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;
using Pampeliska.Tests.OAuth;

namespace Pampeliska.Tests.Services;

/// <summary>
/// Služby nad InMemory DB s pevným časem (dnes = 28. 9. 2026). Připravená domácnost: Vašek (1) a Míša (2),
/// účty Běžný (ČS, Vašek), Společný (Fio, 70:30), Spořicí (ČS, společný), Eurový (Fio, EUR, Vašek) a strom kategorií „Doporučený“.
/// </summary>
public sealed class TestEnv : IDisposable
{
    public static readonly DateOnly Today = new(2026, 9, 28);
    public TestClock Clock { get; } = new(new DateTimeOffset(2026, 9, 28, 10, 0, 0, TimeSpan.Zero));
    private readonly ServiceProvider _root;
    private readonly IServiceScope _scope;
    public IServiceProvider Services => _scope.ServiceProvider;
    public AppDbContext Db => Get<AppDbContext>();

    public Member Vasek { get; private set; } = null!;
    public Member Misa { get; private set; } = null!;
    public Account Bezny { get; private set; } = null!;
    public Account Spolecny { get; private set; } = null!;
    public Account Sporici { get; private set; } = null!;
    public Account Eurovy { get; private set; } = null!;

    public TestEnv()
    {
        var name = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(name));
        services.AddSingleton<TimeProvider>(Clock);
        services.AddPampeliskaCore();
        _root = services.BuildServiceProvider();
        _scope = _root.CreateScope();
        SeedAsync().GetAwaiter().GetResult();
    }

    public T Get<T>() where T : notnull => Services.GetRequiredService<T>();

    /// <summary>Nový scope (čerstvý DbContext) – pro ověření, že se změny uložily.</summary>
    public AppDbContext FreshDb() => _root.CreateScope().ServiceProvider.GetRequiredService<AppDbContext>();

    private async Task SeedAsync()
    {
        var db = Db;
        await Seed.EnsureAsync(db, Clock);
        var h = await db.Households.FirstAsync();
        h.Name = "Novákovi";
        h.Settings.OnboardingDone = true;
        Vasek = new Member { Name = "Vašek", Email = "vasek@example.com", Role = MemberRole.Owner, Status = MemberStatus.Active, ColorToken = "c1" };
        Misa = new Member { Name = "Míša", Email = "misa@example.com", Role = MemberRole.Member, Status = MemberStatus.Active, ColorToken = "c4", SortOrder = 1 };
        db.Members.AddRange(Vasek, Misa);
        await db.SaveChangesAsync();
        await Seed.ApplyCategoryTemplateAsync(db, "rec");
        for (var d = Today.AddDays(-400); d <= Today; d = d.AddDays(1))
        {
            db.ExchangeRates.Add(new ExchangeRate { Date = d, Currency = "EUR", Rate = 24.38m });
            db.ExchangeRates.Add(new ExchangeRate { Date = d, Currency = "USD", Rate = 20.70m });
        }
        await db.SaveChangesAsync();
        var accounts = Get<AccountService>();
        Bezny = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "cs", "Běžný účet", "123-4567890/0800", OwnerMemberId: Vasek.Id,
            OpeningBalance: 10_000, OpeningDate: new DateOnly(2026, 1, 1), LowBalanceLimit: 5000));
        Spolecny = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "fio", "Společný účet", "2900111222/2010", Joint: true,
            Ratio: new() { [Vasek.Id] = 70, [Misa.Id] = 30 }, OpeningBalance: 5_000, OpeningDate: new DateOnly(2026, 1, 1)));
        Sporici = await accounts.CreateAsync(new AccountInput(AccountKind.Savings, "cs", "Spořicí účet", "987654321/0800", Joint: true,
            Ratio: new() { [Vasek.Id] = 50, [Misa.Id] = 50 }, OpeningBalance: 100_000, OpeningDate: new DateOnly(2026, 1, 1)));
        Eurovy = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "fio", "Eurový účet", "2900333444/2010", Currency: "EUR",
            OwnerMemberId: Vasek.Id, OpeningBalance: 1000, OpeningDate: new DateOnly(2026, 1, 1)));
    }

    public int Cat(string name) => Db.Categories.AsNoTracking().First(c => c.Name == name).Id;

    public Task<ImportResult> ImportAsync(Account account, params ImportItem[] items) =>
        Get<ImportService>().ImportAsync(account.Id, items, new ImportOptions(BatchSource.Mcp, "Test", Vasek.Id, "client", "Test klient"));

    public static ImportItem Tx(string date, decimal amount, string counterparty, PaymentType? type = null, string? counterAccount = null,
        string? time = null, string? externalId = null) =>
        new(DateOnly.Parse(date), amount, counterparty, time is null ? null : TimeOnly.Parse(time), CounterpartyAccount: counterAccount,
            PaymentType: type, ExternalId: externalId);

    public void Dispose()
    {
        _scope.Dispose();
        _root.Dispose();
    }
}

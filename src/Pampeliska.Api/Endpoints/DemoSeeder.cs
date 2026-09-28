using Microsoft.EntityFrameworkCore;
using Pampeliska.Core;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Api.Endpoints;

/// <summary>
/// Ukázková domácnost pro lokální vývoj a E2E testy (jen /testing): dva členové, 7 účtů, půl roku pohybů,
/// pravidla, pravidelné platby, rozpočty, investice a pár nepotvrzených návrhů ve frontě.
/// </summary>
public class DemoSeeder(AppDbContext db, HouseholdService household, AccountService accounts, ImportService import, TransactionService txs,
    RuleService rules, RecurringService recurring, BudgetService budgets, InvestmentService investments, TimeProvider time)
{
    private readonly Random _rnd = new(42);

    public async Task SeedAsync(int ownerId)
    {
        if (await db.Transactions.AnyAsync()) throw new DomainException("Ukázková data jde nahrát jen do prázdné domácnosti.");
        var today = time.Today();
        var start = new DateOnly(today.Year, today.Month, 1).AddMonths(-5);
        await EnsureRatesAsync(start.AddDays(-10), today);

        var owner = await db.Members.FindAsync(ownerId) ?? throw new DomainException("Chybí vlastník.");
        if (!await db.Categories.AnyAsync()) await Seed.ApplyCategoryTemplateAsync(db, "rec");
        var misa = await db.Members.FirstOrDefaultAsync(m => m.Email == "misa@example.com")
                   ?? await household.AddMemberAsync(new MemberInput("Míša", "misa@example.com", "c4"));
        var h = await db.Households.FirstAsync();
        if (h.Name == "Domácnost") h.Name = "Domácnost Novákovi";
        h.Settings.OnboardingDone = true;
        await db.SaveChangesAsync();

        var opening = start.AddDays(-1);
        var bezny = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "cs", "Běžný účet", "CZ6508000000192000145399", OwnerMemberId: owner.Id,
            OpeningBalance: 38_000, OpeningDate: opening, LowBalanceLimit: 5000,
            Conditions: [new ConditionInput(ConditionType.IncomingSum, 15000, "Vedení účtu zdarma"), new ConditionInput(ConditionType.CardCount, 5, null)]));
        var spol = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "fio", "Společný účet", "2901234567/2010", Joint: true,
            Ratio: new() { [owner.Id] = 70, [misa.Id] = 30 }, CardToHolder: true, OpeningBalance: 12_000, OpeningDate: opening, LowBalanceLimit: 3000,
            Conditions: [new ConditionInput(ConditionType.AvgBalance, 10000, null)]));
        var osob = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "rb", "Osobní účet", "1122334455/5500", OwnerMemberId: misa.Id,
            OpeningBalance: 21_000, OpeningDate: opening, LowBalanceLimit: 3000,
            Conditions: [new ConditionInput(ConditionType.CardCount, 10, "Vrácení poplatku 99 Kč")]));
        var spor = await accounts.CreateAsync(new AccountInput(AccountKind.Savings, "ab", "Spořicí účet", "1234567890/3030", Joint: true,
            Ratio: new() { [owner.Id] = 50, [misa.Id] = 50 }, InterestRate: 3.2m, OpeningBalance: 380_000, OpeningDate: opening,
            Conditions: [new ConditionInput(ConditionType.IncomingSum, 20000, "Úrok 3,2 % místo 1,5 %")]));
        var eur = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "fio", "Eurový účet", "2907654321/2010", Currency: "EUR",
            OwnerMemberId: owner.Id, OpeningBalance: 2100, OpeningDate: opening));
        var usd = await accounts.CreateAsync(new AccountInput(AccountKind.Current, "rev", "Dolarový účet", "LT123250000000000001", Currency: "USD",
            OwnerMemberId: misa.Id, OpeningBalance: 1300, OpeningDate: opening));
        var etf = await accounts.CreateAsync(new AccountInput(AccountKind.Investment, "xtb", "ETF portfolio", "XTB-448812", Currency: "EUR", Joint: true,
            Ratio: new() { [owner.Id] = 50, [misa.Id] = 50 }, InvestmentKind: InvestmentKind.Etf, FundingAccountId: bezny.Id,
            OpeningBalance: 52_000, OpeningDeposits: 48_000, OpeningDate: opening));

        // Pravidla
        async Task Rule(string merchant, string cat, NeedType? need = null, bool recurringFlag = false)
        {
            var c = await db.Categories.FirstAsync(x => x.Name == cat);
            await rules.CreateAsync(new RuleInput([new ConditionDto2(RuleField.Merchant, RuleOp.Contains, merchant)], RuleLogic.And, c.Id, need, need is not null,
                MarkRecurring: recurringFlag, Source: RuleSource.Manual));
        }
        await Rule("ALBERT", "Supermarkety");
        await Rule("LIDL", "Supermarkety");
        await Rule("ROHLIK", "Supermarkety");
        await Rule("HYPOTEKA", "Hypotéka / nájem", recurringFlag: true);
        await Rule("SVJ KORUNNI", "SVJ a fond oprav", recurringFlag: true);
        await Rule("CEZ", "Elektřina", recurringFlag: true);
        await Rule("NETFLIX", "Streaming", recurringFlag: true);
        await Rule("SPOTIFY", "Hudba", recurringFlag: true);
        await Rule("MZDA", "Mzda", recurringFlag: true);
        await Rule("BOOKING", "Dovolená");
        await Rule("O2 CZECH", "Telefon a internet", recurringFlag: true);
        await Rule("LITACKA", "MHD");

        var items = new Dictionary<int, List<ImportItem>> { [bezny.Id] = [], [spol.Id] = [], [osob.Id] = [], [spor.Id] = [], [eur.Id] = [], [usd.Id] = [] };
        void Add(Account a, DateOnly d, decimal amount, string who, PaymentType type = PaymentType.Other, string? counter = null, string? time = null) =>
            items[a.Id].Add(new ImportItem(d, amount, who, time is null ? null : TimeOnly.Parse(time), CounterpartyAccount: counter, PaymentType: type,
                RawText: $"{who.ToUpperInvariant()} {d:dd.MM.}"));
        DateOnly Day(DateOnly m, int d) => new(m.Year, m.Month, Math.Min(d, DateTime.DaysInMonth(m.Year, m.Month)));

        for (var m = start; m <= today; m = m.AddMonths(1))
        {
            void Monthly(Account a, int day, decimal amount, string who, PaymentType type = PaymentType.StandingOrder, string? counter = null)
            {
                var d = Day(m, day);
                if (d <= today) Add(a, d, amount, who, type, counter);
            }
            Monthly(bezny, 10, 68880 + _rnd.Next(-800, 800), "MZDA ŠKODA AUTO", PaymentType.Transfer);
            Monthly(osob, 24, 29520, "MZDA ARCADIS CZ", PaymentType.Transfer);
            Monthly(bezny, 1, -18900, "ČS HYPOTEKA 0801", PaymentType.DirectDebit);
            Monthly(bezny, 5, -3200, "SVJ KORUNNI 12", PaymentType.StandingOrder);
            Monthly(bezny, 3, -1900 - _rnd.Next(0, 300), "CEZ PRODEJ ZALOHA", PaymentType.DirectDebit);
            Monthly(bezny, 8, -1499, "O2 CZECH REPUBLIC", PaymentType.DirectDebit);
            Monthly(spol, 25, -329, "NETFLIX.COM", PaymentType.Card);
            Monthly(usd, 20, -12.99m, "SPOTIFY USA", PaymentType.Card);
            Monthly(eur, 3, -12.99m, "GOOGLE YOUTUBE PREMIUM", PaymentType.Card);
            // Příspěvky na společný a spoření (převody)
            Monthly(bezny, 15, -15000, "Příspěvek na společný", PaymentType.StandingOrder, "2901234567/2010");
            Monthly(spol, 15, 15000, "Novák Václav", PaymentType.Transfer, "192000145399/0800");
            Monthly(osob, 26, -6500, "Příspěvek na společný", PaymentType.StandingOrder, "2901234567/2010");
            Monthly(spol, 26, 6500, "Nováková Michaela", PaymentType.Transfer, "1122334455/5500");
            Monthly(bezny, 12, -10000, "Spoření", PaymentType.StandingOrder, "1234567890/3030");
            Monthly(spor, 12, 10000, "Novák Václav", PaymentType.Transfer, "192000145399/0800");
            Monthly(bezny, 26, -8000, "XTB nákup ETF", PaymentType.Transfer, "XTB-448812");
            // Běžné útraty
            var days = m.Month == today.Month && m.Year == today.Year ? today.Day : DateTime.DaysInMonth(m.Year, m.Month);
            for (var i = 0; i < 9; i++) Add(spol, Day(m, 1 + _rnd.Next(days)), -(350 + _rnd.Next(1400)), _rnd.Next(3) switch { 0 => "ALBERT HYPERMARKET", 1 => "LIDL DEKUJE ZA NAKUP", _ => "ROHLIK.CZ" }, PaymentType.Card, time: $"{10 + _rnd.Next(10)}:{_rnd.Next(10, 59)}");
            for (var i = 0; i < 5; i++) Add(osob, Day(m, 1 + _rnd.Next(days)), -(90 + _rnd.Next(220)), _rnd.Next(2) == 0 ? "CAFE LOUNGE" : "STARBUCKS", PaymentType.Card, time: $"{8 + _rnd.Next(9)}:{_rnd.Next(10, 59)}");
            for (var i = 0; i < 3; i++) Add(bezny, Day(m, 1 + _rnd.Next(days)), -(1400 + _rnd.Next(900)), "BENZINA PRAHA", PaymentType.Card);
            for (var i = 0; i < 2; i++) Add(spol, Day(m, 1 + _rnd.Next(days)), -(380 + _rnd.Next(900)), _rnd.Next(2) == 0 ? "LOKAL DLOUHA" : "WOLT PRAHA", PaymentType.Card, time: $"{12 + _rnd.Next(9)}:{_rnd.Next(10, 59)}");
            Add(bezny, Day(m, 2 + _rnd.Next(Math.Max(1, days - 1))), -550, "LITACKA", PaymentType.Card);
            Add(osob, Day(m, 1 + _rnd.Next(days)), -(300 + _rnd.Next(900)), "DM DROGERIE", PaymentType.Card);
            if (m.Month % 2 == 0) Add(bezny, Day(m, 1 + _rnd.Next(days)), -(1500 + _rnd.Next(9000)), "ALZA.CZ", PaymentType.Card);
            if (m.Month == 7) Add(eur, Day(m, 12), -612.5m, "BOOKING.COM HOTEL", PaymentType.Card);
            Add(spor, Day(m, Math.Min(days, 28)), 950, "Připsané úroky", PaymentType.Interest);
        }
        // Podezřelá duplicita a dvě nejisté platby v aktuálním měsíci
        Add(bezny, today.AddDays(-2), -7244, "ALZA.CZ", PaymentType.Card);
        Add(bezny, today.AddDays(-1), -1386, "SPORTISIMO PRAHA", PaymentType.Card);

        var batchIds = new List<int>();
        foreach (var (accountId, list) in items.Where(kv => kv.Value.Count > 0))
            batchIds.Add((await import.ImportAsync(accountId, list, new ImportOptions(BatchSource.Mcp, "Claude Desktop (demo)", owner.Id, "demo", "Claude Desktop"))).BatchId);

        // Kategorizace: kromě posledních dní vše zařadit a potvrdit
        var cats = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Name, c => c.Id);
        var uncategorized = await db.Transactions.Where(t => t.CategoryId == null && (t.Kind == TransactionKind.Expense || t.Kind == TransactionKind.Income)).ToListAsync();
        var suggestions = new List<AiSuggestion>();
        foreach (var t in uncategorized)
        {
            var c = Text.Normalize(t.Counterparty);
            var (cat, conf) = c.Contains("benzina") ? ("Palivo", 96) : c.Contains("cafe") || c.Contains("starbucks") ? ("Kavárny", 94)
                : c.Contains("lokal") || c.Contains("wolt") ? ("Restaurace", 91) : c.Contains("dm drog") ? ("Drogerie", 97)
                : c.Contains("alza") ? ("Elektronika", 62) : c.Contains("sportisimo") ? ("Sport", 58) : c.Contains("youtube") ? ("Streaming", 95)
                : c.Contains("booking") ? ("Dovolená", 99) : c.Contains("urok") ? ("Úroky", 98) : ("", 0);
            if (cat.Length > 0) suggestions.Add(new AiSuggestion(t.Id, cats[cat], null, conf, conf < 70 ? "Obchodník prodává víc druhů zboží." : "Podle typu obchodníka.",
                cat == "Elektronika" ? [new AiAlternative(cats["Vybavení domácnosti"], 21), new AiAlternative(cats["Dárky"], 9)] : null));
        }
        await txs.SuggestAsync(suggestions, "Claude Desktop (demo)");
        var older = await db.Transactions.Where(t => t.Status == TransactionStatus.Suggested && t.Date < today.AddDays(-5) && (t.CategoryId != null))
            .Select(t => t.Id).ToListAsync();
        await txs.ConfirmAsync(older, "Demo");

        // Pravidelné platby
        async Task Rec(Account a, string name, string pattern, decimal amount, int day, string? cat, AmountKind kind = AmountKind.Fixed, Frequency f = Frequency.Monthly)
        {
            var anchor = f == Frequency.Yearly ? today.AddDays(day)
                : new DateOnly(today.Year, today.Month, Math.Min(day, DateTime.DaysInMonth(today.Year, today.Month)));
            await recurring.CreateAsync(new RecurringInput(a.Id, name, pattern, cat is null ? null : cats[cat], cat is not null, amount, kind, 15, f, anchor), RecurringSource.Manual);
        }
        await Rec(bezny, "Hypotéka", "HYPOTEKA", -18900, 1, "Hypotéka / nájem");
        await Rec(bezny, "SVJ Korunní 12", "SVJ KORUNNI", -3200, 5, "SVJ a fond oprav");
        await Rec(bezny, "ČEZ elektřina", "CEZ", -2000, 3, "Elektřina", AmountKind.Variable);
        await Rec(bezny, "O2 Internet + mobil", "O2 CZECH", -1499, 8, "Telefon a internet");
        await Rec(spol, "Netflix", "NETFLIX", -329, 25, "Streaming");
        await Rec(usd, "Spotify", "SPOTIFY", -12.99m, 20, "Hudba");
        await Rec(eur, "YouTube Premium", "YOUTUBE", -12.99m, 3, "Streaming");
        await Rec(bezny, "Mzda Vašek", "MZDA SKODA", 68880, 10, "Mzda", AmountKind.Variable);
        await Rec(osob, "Mzda Míša", "MZDA ARCADIS", 29520, 24, "Mzda");
        await Rec(bezny, "Pojištění auta", "KOOPERATIVA", -9800, 9, "Pojištění auta", f: Frequency.Yearly);

        // Rozpočty
        async Task Budget(string cat, decimal amount, BudgetPeriod p = BudgetPeriod.Monthly, bool carry = false) =>
            await budgets.SetAsync(new BudgetInput(cats[cat], null, p, amount, carry));
        await Budget("Bydlení", 25500);
        await Budget("Supermarkety", 11000, carry: true);
        await Budget("Restaurace", 3500);
        await Budget("Elektronika a domácnost", 6000);
        await Budget("Volný čas", 5000);
        await Budget("Doprava", 6000);
        await Budget("Předplatné a služby", 2800);
        await Budget("Dovolená", 60000, BudgetPeriod.Yearly);
        await budgets.SetAsync(new BudgetInput(cats["Kavárny"], misa.Id, BudgetPeriod.Monthly, 1200, false));
        foreach (var fixedName in new[] { "Hypotéka / nájem", "SVJ a fond oprav" })
            (await db.Categories.FirstAsync(c => c.Name == fixedName)).IsFixed = true;
        await db.SaveChangesAsync();

        // Investice
        var value = 52_000m;
        for (var m = start; m <= today; m = m.AddMonths(1))
        {
            value = Math.Round(value * (1 + (decimal)(_rnd.NextDouble() * 0.05 - 0.015)) + 800, 0);
            var d = Day(m, 28) > today ? today : Day(m, 28);
            await investments.AddValueAsync(etf.Id, d, value);
        }
        await investments.AddTradeAsync(new TradeInput(etf.Id, today.AddDays(-2), TradeSide.Buy, "VWCE", "Vanguard FTSE All-World", 7, 109.52m, "EUR", null));
        await investments.AddTradeAsync(new TradeInput(etf.Id, today.AddDays(-60), TradeSide.Buy, "CSPX", "iShares Core S&P 500", 1, 589.2m, "EUR", null));
        await recurring.DetectAsync();
    }

    private async Task EnsureRatesAsync(DateOnly from, DateOnly to)
    {
        var have = (await db.ExchangeRates.Where(r => r.Date >= from && r.Date <= to).Select(r => new { r.Date, r.Currency }).ToListAsync())
            .Select(x => (x.Date, x.Currency)).ToHashSet();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            if (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            var eurRate = 24.3m + (decimal)Math.Sin(d.DayNumber / 17.0) * 0.25m;
            var usdRate = 20.7m + (decimal)Math.Cos(d.DayNumber / 23.0) * 0.4m;
            if (!have.Contains((d, "EUR"))) db.ExchangeRates.Add(new ExchangeRate { Date = d, Currency = "EUR", Rate = Math.Round(eurRate, 3) });
            if (!have.Contains((d, "USD"))) db.ExchangeRates.Add(new ExchangeRate { Date = d, Currency = "USD", Rate = Math.Round(usdRate, 3) });
        }
        await db.SaveChangesAsync();
    }
}

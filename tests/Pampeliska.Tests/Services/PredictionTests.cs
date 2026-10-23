using Microsoft.EntityFrameworkCore;
using Pampeliska.Core;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class PredictionTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    /// <summary>Březen–září: nákupy 3 000 Kč/měsíc (v září zatím 1 000), mzda 50 000 Kč jako pravidelná platba 10. v měsíci.</summary>
    private async Task SeedAsync(Account? account = null)
    {
        var acc = account ?? _env.Bezny;
        var tx = _env.Get<TransactionService>();
        for (var m = 3; m <= 9; m++)
        {
            var shop = await _env.ImportAsync(acc, TestEnv.Tx($"2026-{m:00}-02", m == 9 ? -1000 : -3000, "Albert"));
            await tx.UpdateAsync(shop.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Supermarkety"), SetCategory: true), "V");
            var salary = await _env.ImportAsync(acc, TestEnv.Tx($"2026-{m:00}-10", 50000, "Mzda Škoda Auto"));
            await tx.UpdateAsync(salary.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Mzda"), SetCategory: true), "V");
        }
        await _env.Get<RecurringService>().CreateAsync(new RecurringInput(acc.Id, "Mzda", "Mzda Škoda", _env.Cat("Mzda"), true, 50000,
            AmountKind.Fixed, Frequency: Frequency.Monthly, AnchorDate: new DateOnly(2026, 3, 10)), RecurringSource.Manual);
    }

    private static PredLeaf Leaf(PredictionDto p, string key)
    {
        PredNode? Find(IEnumerable<PredNode> nodes) => nodes.Select(n => n.Key == key ? n : Find(n.Children ?? [])).FirstOrDefault(n => n is not null);
        return Find(p.Tree)?.Leaf ?? throw new Xunit.Sdk.XunitException($"Položka {key} chybí.");
    }

    [Fact]
    public async Task Baseline_uses_recurring_by_calendar_and_six_month_average_with_rest_of_current_month()
    {
        await SeedAsync();
        var p = await _env.Get<PredictionService>().GetAsync(12, null);

        Assert.Equal(6, p.DataMonths);
        Assert.Equal(12, p.Months.Count);
        Assert.Equal("2026-09", p.Months[0].Month);
        var shop = Leaf(p, $"c{_env.Cat("Supermarkety")}");
        Assert.Equal(-2000, shop.Base[0]);
        Assert.Equal(-3000, shop.Base[1]);
        Assert.Equal(-1, shop.Sign);
        var salary = Leaf(p, $"c{_env.Cat("Mzda")}");
        Assert.Equal(0, salary.Base[0]);
        Assert.Equal(50000, salary.Base[1]);
        Assert.Equal("Mzda · 10.", salary.Note);
        Assert.Equal(p.Start - 2000, p.Months[0].Balance);
        Assert.Equal(p.Months[0].Balance + 47000, p.Months[1].Balance);
        Assert.Equal(p.Months[1].Balance, p.Months[1].BaseBalance);
        Assert.Equal(12, p.History.Count);
        Assert.Equal(-3000, p.History[^1].Cats[$"c{_env.Cat("Jídlo")}"]);
        Assert.Equal(p.Start + 1000 - 50000, p.History[^1].Balance);
    }

    [Fact]
    public async Task Average_can_use_last_three_or_one_closed_month()
    {
        await SeedAsync();
        var extra = await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-08-20", -6000, "Albert velký nákup"));
        await _env.Get<TransactionService>().UpdateAsync(extra.TransactionIds[0], new TxUpdate(CategoryId: _env.Cat("Supermarkety"), SetCategory: true), "V");
        var svc = _env.Get<PredictionService>();
        var shop = $"c{_env.Cat("Supermarkety")}";

        // Srpen 9 000, ostatní měsíce 3 000 Kč
        var six = await svc.GetAsync(12, null);
        var three = await svc.GetAsync(12, null, 3);
        var one = await svc.GetAsync(12, null, 1);
        Assert.Equal((6, -4000m), (six.DataMonths, Leaf(six, shop).Base[1]));
        Assert.Equal((3, -5000m), (three.DataMonths, Leaf(three, shop).Base[1]));
        Assert.Equal((1, -9000m), (one.DataMonths, Leaf(one, shop).Base[1]));
        Assert.Equal("průměr 1 měsíce", Leaf(one, shop).Note);
        Assert.Equal(6, (await svc.GetAsync(12, null, 5)).DataMonths);
    }

    [Fact]
    public async Task Scenario_changes_one_offs_and_skips_shift_the_balance()
    {
        await SeedAsync();
        await _env.Get<RecurringService>().CreateAsync(new RecurringInput(_env.Bezny.Id, "Pojištění auta", "Kooperativa", _env.Cat("Pojištění auta"), true,
            -9800, Frequency: Frequency.Yearly, AnchorDate: new DateOnly(2025, 11, 15)), RecurringSource.Manual);
        var svc = _env.Get<PredictionService>();
        var before = await svc.GetAsync(12, null);
        var insurance = Assert.Single(before.OneOffs, o => o.Kind == "recurring");
        Assert.Equal(("r", "2026-11", -9800m), (insurance.Key[..1], insurance.Month, insurance.Amount));

        var shop = $"c{_env.Cat("Supermarkety")}";
        await svc.SaveScenarioAsync(new Scenario(
            [new ScenarioChange("c1", shop, "2026-10", null, -5000), new ScenarioChange("c2", shop, "2026-12", "2026-12", -8000)],
            [new ScenarioRecurring("g1", "Nájem garáže", -1500, "2027-01")],
            [new ScenarioOneOff("o1", "2026-11", "Pračka", -14000), new ScenarioOneOff("old", "2026-08", "Prošlá", -1)],
            [insurance.Key]), "test");
        var p = await svc.GetAsync(12, null);

        Assert.DoesNotContain(p.Scenario.OneOffs!, o => o.Id == "old");
        var leaf = Leaf(p, shop);
        Assert.Equal([-2000m, -5000, -5000, -8000, -5000], leaf.Value.Take(5));
        Assert.Equal(-3000, leaf.Base[3]);
        Assert.Equal([0m, 0, 0, 0, -1500], Leaf(p, "ag1").Value.Take(5));
        Assert.True(p.OneOffs.Single(o => o.Key == insurance.Key).Skipped);
        // Listopad: −2 000 nákupy navíc, pračka −14 000, bez pojištění +9 800
        var novDiff = (p.Months[2].Balance - p.Months[1].Balance) - (before.Months[2].Balance - before.Months[1].Balance);
        Assert.Equal(-2000 - 14000 + 9800, novDiff);
        Assert.Equal(before.Months[11].BaseBalance, p.Months[11].BaseBalance);
    }

    [Fact]
    public async Task Invalid_scenario_is_rejected()
    {
        var svc = _env.Get<PredictionService>();
        var e = await Assert.ThrowsAsync<DomainException>(() =>
            svc.SaveScenarioAsync(new Scenario([new ScenarioChange("c1", "c1", "2026-13", null, -1)]), "test"));
        Assert.Contains("Neplatný měsíc", e.Message);
        await Assert.ThrowsAsync<DomainException>(() => svc.SaveScenarioAsync(new Scenario(OneOffs: [new ScenarioOneOff("o1", "2026-10", " ", -1)]), "test"));
        await Assert.ThrowsAsync<DomainException>(() => svc.SaveScenarioAsync(new Scenario(Changes: [new ScenarioChange("c1", "DROP", "2026-10", null, 1)]), "test"));
    }

    [Fact]
    public async Task Member_view_weights_joint_account_and_scales_household_changes()
    {
        await SeedAsync(_env.Spolecny);
        var svc = _env.Get<PredictionService>();
        var shop = $"c{_env.Cat("Supermarkety")}";
        var misa = await svc.GetAsync(12, _env.Misa.Id);
        Assert.Equal(-900, Leaf(misa, shop).Base[1]);
        Assert.Equal(15000, Leaf(misa, $"c{_env.Cat("Mzda")}").Base[1]);

        await svc.SaveScenarioAsync(new Scenario([new ScenarioChange("c1", shop, "2026-10", null, -2000)]), "test");
        misa = await svc.GetAsync(12, _env.Misa.Id);
        Assert.Equal(0.3m, Leaf(misa, shop).Share);
        Assert.Equal(-600, Leaf(misa, shop).Value[1]);
        var all = await svc.GetAsync(12, null);
        Assert.Equal(-2000, Leaf(all, shop).Value[1]);
    }

    [Fact]
    public async Task Transfers_to_non_disposable_accounts_are_averaged_internal_ones_ignored()
    {
        await SeedAsync();
        var acc = await _env.Db.Accounts.FirstAsync(a => a.Id == _env.Sporici.Id);
        acc.IncludeInDisposable = false;
        await _env.Db.SaveChangesAsync();
        for (var m = 3; m <= 8; m++)
        {
            await _env.ImportAsync(_env.Bezny, TestEnv.Tx($"2026-{m:00}-15", -2000, "Na spoření", counterAccount: "987654321/0800"));
            await _env.ImportAsync(_env.Bezny, TestEnv.Tx($"2026-{m:00}-16", -700, "Na společný", counterAccount: "2900111222/2010"));
        }
        var p = await _env.Get<PredictionService>().GetAsync(6, null);
        Assert.Equal(-2000, Leaf(p, "x").Base[1]);
        Assert.Equal(-2000, p.History[^1].Cats["x"]);
    }

    [Fact]
    public async Task Snapshot_keeps_plan_for_household_and_members()
    {
        await SeedAsync();
        var svc = _env.Get<PredictionService>();
        var id = await svc.SaveSnapshotAsync("  Plán na podzim ", 6, "test");
        var p = await svc.GetAsync(12, _env.Vasek.Id);
        var s = Assert.Single(p.Snapshots);
        Assert.Equal((id, "Plán na podzim", 6), (s.Id, s.Name, s.Horizon));
        Assert.NotNull(s.Plan);
        Assert.Equal(6, s.Plan!.Months.Count);
        // Aktuální měsíc v plánu celý: 1 000 už proběhlo + 2 000 zbývá
        Assert.Equal(-3000, s.Plan.Months[0].Cats[$"c{_env.Cat("Jídlo")}"]);
        Assert.Equal(p.Months[1].Balance, s.Plan.Months[1].Balance);
        await svc.DeleteSnapshotAsync(id);
        Assert.Empty((await svc.GetAsync(12, null)).Snapshots);
    }

    [Fact]
    public async Task Expected_yearly_payment_repeats_and_can_be_deleted()
    {
        var svc = _env.Get<PredictionService>();
        var e = await svc.AddExpectedAsync(new ExpectedPaymentInput("Vánoce", "2025-12", -22000, Yearly: true, Note: "odhad z loňska"), "AI");
        var p = await svc.GetAsync(24, null);
        Assert.Equal(["2026-12", "2027-12"], p.OneOffs.Where(o => o.Kind == "expected").Select(o => o.Month));
        Assert.Equal("odhad z loňska", p.OneOffs[0].Source);
        await Assert.ThrowsAsync<DomainException>(() => svc.AddExpectedAsync(new ExpectedPaymentInput("Staré", "2026-01", -1), "AI"));
        await svc.DeleteExpectedAsync(e.Id);
        Assert.Empty((await svc.GetAsync(24, null)).OneOffs);
    }

    [Fact]
    public void Remaining_never_goes_past_zero()
    {
        Assert.Equal(-2000, PredictionService.Remaining(-3000, -1000));
        Assert.Equal(0, PredictionService.Remaining(-3000, -4000));
        Assert.Equal(20000, PredictionService.Remaining(50000, 30000));
        Assert.Equal(0, PredictionService.Remaining(0, -100));
    }
}

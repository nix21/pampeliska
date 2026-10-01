using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class SavingTipTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    private SavingTipService Tips => _env.Get<SavingTipService>();

    [Fact]
    public async Task Created_tip_is_active_from_today_and_lists_its_payments()
    {
        await _env.ImportAsync(_env.Spolecny, TestEnv.Tx("2026-09-10", -540, "WOLT PRAHA"), TestEnv.Tx("2026-09-12", -1200, "ALBERT"));
        var wolt = _env.Db.Transactions.Single(t => t.Counterparty == "WOLT PRAHA").Id;

        var t = await Tips.CreateAsync(new SavingTipInput("  Rozvoz jídla roste ", "Za Wolt platíte víc než loni.", "Jídlo", 1200,
            Evidence: "platby Wolt", TransactionIds: [wolt, wolt]), "Claude (Vašek)");
        Assert.Equal("Rozvoz jídla roste", t.Title);
        Assert.Equal(SavingTipStatus.Active, t.Status);
        Assert.Equal(TestEnv.Today, t.Since);
        Assert.Equal([wolt], t.TransactionIds);

        var page = await _env.Get<TransactionService>().ListAsync(new TxFilter(Ids: await Tips.TransactionIdsAsync(t.Id)));
        Assert.Equal("WOLT PRAHA", Assert.Single(page.Items).Counterparty);
    }

    [Theory]
    [InlineData("", "text", "Jídlo", "Nadpis")]
    [InlineData("Nadpis", " ", "Jídlo", "Text rady")]
    [InlineData("Nadpis", "text", "", "Štítek")]
    public async Task Invalid_input_is_rejected(string title, string body, string topic, string message)
    {
        var e = await Assert.ThrowsAsync<DomainException>(() => Tips.CreateAsync(new SavingTipInput(title, body, topic), "AI"));
        Assert.Contains(message, e.Message);
    }

    [Fact]
    public async Task Unknown_payment_negative_saving_and_unknown_member_are_rejected()
    {
        await Assert.ThrowsAsync<DomainException>(() => Tips.CreateAsync(new SavingTipInput("A", "B", "C", TransactionIds: [99_999]), "AI"));
        await Assert.ThrowsAsync<DomainException>(() => Tips.CreateAsync(new SavingTipInput("A", "B", "C", -5), "AI"));
        await Assert.ThrowsAsync<DomainException>(() => Tips.CreateAsync(new SavingTipInput("A", "B", "C", MemberId: 99_999), "AI"));
    }

    [Fact]
    public async Task Restored_tip_shows_again_from_current_month_and_rejected_tip_cannot_be_deleted()
    {
        var t = await Tips.CreateAsync(new SavingTipInput("Káva", "Káva z domu.", "Jídlo", 750), "AI");
        await Tips.SetStatusAsync(t.Id, SavingTipStatus.Hidden);
        Assert.Single(await Tips.ListAsync(SavingTipStatus.Hidden));

        _env.Clock.Advance(TimeSpan.FromDays(40));
        var restored = await Tips.SetStatusAsync(t.Id, SavingTipStatus.Active);
        Assert.Equal(new DateOnly(2026, 11, 7), restored.Since);

        await Tips.SetStatusAsync(t.Id, SavingTipStatus.Rejected);
        await Assert.ThrowsAsync<DomainException>(() => Tips.DeleteAsync(t.Id));

        var other = await Tips.CreateAsync(new SavingTipInput("Pojištění", "Srovnejte nabídky.", "Pojištění"), "AI");
        await Tips.DeleteAsync(other.Id);
        Assert.Single(await Tips.ListAsync());
    }

    [Fact]
    public async Task Update_replaces_content_but_keeps_status_and_month()
    {
        var t = await Tips.CreateAsync(new SavingTipInput("Streaming", "Čtyři služby.", "Předplatné", 390, Search: "netflix"), "AI");
        await Tips.SetStatusAsync(t.Id, SavingTipStatus.Hidden);
        _env.Clock.Advance(TimeSpan.FromDays(10));
        var u = await Tips.UpdateAsync(t.Id, new SavingTipInput("Streaming", "Tři služby.", "Předplatné", 260, SavingLabel: "≈ 3 000 Kč / rok"));
        Assert.Equal("Tři služby.", u.Body);
        Assert.Null(u.Search);
        Assert.Equal(SavingTipStatus.Hidden, u.Status);
        Assert.Equal(TestEnv.Today, u.Since);
    }
}

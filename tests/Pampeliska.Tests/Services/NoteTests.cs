using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Domain;
using Pampeliska.Core.Services;

namespace Pampeliska.Tests.Services;

public class NoteTests : IDisposable
{
    private readonly TestEnv _env = new();
    public void Dispose() => _env.Dispose();

    private NoteService Notes => _env.Get<NoteService>();

    [Fact]
    public async Task Create_update_and_search_notes()
    {
        var n = await Notes.CreateAsync(new NoteInput("  Platby od Jana K. jsou kapesné pro dceru.  ", "Jana K", _env.Cat("Jídlo")), "Claude (Vašek)");
        Assert.Equal("Platby od Jana K. jsou kapesné pro dceru.", n.Text);
        Assert.Equal("Jídlo", n.CategoryPath);
        Assert.Equal("Claude (Vašek)", n.CreatedBy);

        _env.Clock.Advance(TimeSpan.FromHours(1));
        var u = await Notes.UpdateAsync(n.Id, new NoteInput("Jana K. = kapesné", null, null), "Míša");
        Assert.Null(u.MerchantPattern);
        Assert.Null(u.CategoryId);
        Assert.Equal("Míša", u.UpdatedBy);
        Assert.True(u.UpdatedAt > u.CreatedAt);

        await Notes.CreateAsync(new NoteInput("Alza: pracovní elektronika do Práce", "Alza"), "Vašek");
        Assert.Single(await Notes.ListAsync("KAPESNE"));
        Assert.Single(await Notes.ListAsync("alza"));
        Assert.Equal(2, (await Notes.ListAsync()).Count);
    }

    [Theory]
    [InlineData("", null, "prázdná")]
    [InlineData("ok", "x", "2–100")]
    public async Task Invalid_input_is_rejected(string text, string? merchant, string message)
    {
        var e = await Assert.ThrowsAsync<DomainException>(() => Notes.CreateAsync(new NoteInput(text, merchant), "Vašek"));
        Assert.Contains(message, e.Message);
    }

    [Fact]
    public async Task Too_long_text_and_unknown_category_are_rejected()
    {
        await Assert.ThrowsAsync<DomainException>(() => Notes.CreateAsync(new NoteInput(new string('a', NoteService.MaxLength + 1)), "Vašek"));
        await Assert.ThrowsAsync<DomainException>(() => Notes.CreateAsync(new NoteInput("ok", CategoryId: 99_999), "Vašek"));
    }

    [Fact]
    public async Task Number_of_notes_is_limited()
    {
        for (var i = 0; i < NoteService.MaxNotes; i++)
            _env.Db.CategorizationNotes.Add(new CategorizationNote { Text = $"n{i}", CreatedBy = "test" });
        await _env.Db.SaveChangesAsync();
        var e = await Assert.ThrowsAsync<DomainException>(() => Notes.CreateAsync(new NoteInput("další"), "Vašek"));
        Assert.Contains("Slouč", e.Message);
    }

    [Fact]
    public async Task Category_merge_moves_notes_and_delete_unlinks_them()
    {
        var cafes = _env.Cat("Kavárny");
        var restaurants = _env.Cat("Restaurace");
        var n = await Notes.CreateAsync(new NoteInput("Kafe s kolegy platí firma", CategoryId: cafes), "Vašek");
        await _env.Get<CategoryService>().MergeAsync(cafes, restaurants);
        Assert.Equal(restaurants, (await Notes.GetAsync(n.Id)).CategoryId);

        var empty = (await _env.Get<CategoryService>().CreateAsync(new CategoryInput("Prázdná"))).Id;
        await Notes.UpdateAsync(n.Id, new NoteInput("Kafe s kolegy platí firma", CategoryId: empty), "Vašek");
        await _env.Get<CategoryService>().DeleteAsync(empty);
        var after = await Notes.GetAsync(n.Id);
        Assert.Null(after.CategoryId);
        Assert.Equal("Kafe s kolegy platí firma", after.Text);
    }

    [Fact]
    public async Task Queue_items_carry_notes_linked_by_merchant_or_suggested_category()
    {
        await _env.ImportAsync(_env.Bezny, TestEnv.Tx("2026-09-20", -1200, "LIDL DEKUJE ZA NAKUP"), TestEnv.Tx("2026-09-21", -89, "Rohlik.cz"),
            TestEnv.Tx("2026-09-22", -500, "Benzina"));
        var rohlik = await _env.Db.Transactions.FirstAsync(t => t.Counterparty == "Rohlik.cz");
        rohlik.CategoryId = _env.Cat("Supermarkety");
        await _env.Db.SaveChangesAsync();

        var byMerchant = await Notes.CreateAsync(new NoteInput("V Lidlu nad 3 000 Kč v prosinci bývají dárky", "lidl"), "Vašek");
        var byCategory = await Notes.CreateAsync(new NoteInput("Jídlo: rozvoz počítej do Restaurace", CategoryId: _env.Cat("Jídlo")), "Vašek");
        await Notes.CreateAsync(new NoteInput("Obecná poznámka bez vazby"), "Vašek");

        var queue = await _env.Get<InboxService>().QueueForAiAsync(50, false, null);
        Assert.Equal([byMerchant.Id], queue.Single(q => q.Counterparty.StartsWith("LIDL")).Notes.Select(n => n.Id));
        Assert.Equal([byCategory.Id], queue.Single(q => q.Counterparty == "Rohlik.cz").Notes.Select(n => n.Id));
        Assert.Empty(queue.Single(q => q.Counterparty == "Benzina").Notes);
    }

    [Fact]
    public async Task Deleting_household_data_removes_notes()
    {
        await Notes.CreateAsync(new NoteInput("Kafe s kolegy platí firma", CategoryId: _env.Cat("Kavárny")), "Vašek");
        await _env.Get<HouseholdService>().DeleteAllDataAsync("Novákovi");
        Assert.False(await _env.FreshDb().CategorizationNotes.AnyAsync());
    }
}

using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record NoteDto(int Id, string Text, string? MerchantPattern, int? CategoryId, string? CategoryPath, string CreatedBy, DateTimeOffset CreatedAt,
    string? UpdatedBy, DateTimeOffset UpdatedAt);

/// <summary>Poznámka připojená k položce fronty – proč se k ní váže (obchodník / kategorie návrhu).</summary>
public record QueueNote(int Id, string Text, string? MerchantPattern, int? CategoryId);

public record NoteInput(string Text, string? MerchantPattern = null, int? CategoryId = null);

/// <summary>Poznámky pro AI ke kategorizaci: sdílená paměť nezávislá na klientovi a členovi.</summary>
public class NoteService(AppDbContext db, TimeProvider time)
{
    public const int MaxLength = 1000;
    public const int MaxNotes = 300;

    public async Task<List<NoteDto>> ListAsync(string? search = null, int? categoryId = null)
    {
        var notes = await db.CategorizationNotes.AsNoTracking().OrderByDescending(n => n.UpdatedAt).ThenByDescending(n => n.Id).ToListAsync();
        var paths = await CategoryService.PathsAsync(db);
        IEnumerable<CategorizationNote> q = notes;
        if (categoryId is { } c)
        {
            var ids = CategoryService.WithDescendants(await db.Categories.AsNoTracking().ToListAsync(), c);
            q = q.Where(n => n.CategoryId is { } nc && ids.Contains(nc));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = Text.Normalize(search);
            q = q.Where(n => Text.Normalize($"{n.Text} {n.MerchantPattern} {(n.CategoryId is { } x ? paths.GetValueOrDefault(x) : null)}").Contains(s));
        }
        return q.Select(n => ToDto(n, paths)).ToList();
    }

    public async Task<NoteDto> GetAsync(int id)
    {
        var n = await db.CategorizationNotes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Poznámka {id} neexistuje.");
        return ToDto(n, await CategoryService.PathsAsync(db));
    }

    public async Task<NoteDto> CreateAsync(NoteInput input, string actor)
    {
        if (await db.CategorizationNotes.CountAsync() >= MaxNotes)
            throw new DomainException($"Poznámek je už {MaxNotes}. Slouč podobné nebo smaž zastaralé, než přidáš další.");
        var (text, pattern) = await ValidateAsync(input);
        var now = time.GetUtcNow();
        var n = new CategorizationNote
        {
            Text = text, MerchantPattern = pattern, CategoryId = input.CategoryId, CreatedBy = Trim(actor), CreatedAt = now, UpdatedAt = now,
        };
        db.CategorizationNotes.Add(n);
        await db.SaveChangesAsync();
        return ToDto(n, await CategoryService.PathsAsync(db));
    }

    /// <summary>Nahradí text i vazby poznámky.</summary>
    public async Task<NoteDto> UpdateAsync(int id, NoteInput input, string actor)
    {
        var n = await db.CategorizationNotes.FindAsync(id) ?? throw new DomainException($"Poznámka {id} neexistuje.");
        var (text, pattern) = await ValidateAsync(input);
        n.Text = text;
        n.MerchantPattern = pattern;
        n.CategoryId = input.CategoryId;
        n.UpdatedBy = Trim(actor);
        n.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync();
        return ToDto(n, await CategoryService.PathsAsync(db));
    }

    public async Task DeleteAsync(int id)
    {
        var n = await db.CategorizationNotes.FindAsync(id) ?? throw new DomainException($"Poznámka {id} neexistuje.");
        db.CategorizationNotes.Remove(n);
        await db.SaveChangesAsync();
    }

    /// <summary>Poznámky k pohybu: obchodník odpovídá vzoru, nebo navržená kategorie (či její předek) je kategorie poznámky.</summary>
    public static List<QueueNote> For(Transaction t, IEnumerable<CategorizationNote> notes, IReadOnlyDictionary<int, int?> parents)
    {
        var merchant = RuleEngine.MerchantText(t);
        var cats = new HashSet<int>();
        foreach (var start in t.Splits.Select(s => s.CategoryId).Append(t.CategoryId ?? 0).Where(c => c != 0))
            for (int? c = start; c is { } x && cats.Add(x); c = parents.GetValueOrDefault(x)) { }
        return notes
            .Where(n => (n.MerchantPattern is { } p && merchant.Contains(Text.Normalize(p))) || (n.CategoryId is { } nc && cats.Contains(nc)))
            .Select(n => new QueueNote(n.Id, n.Text, n.MerchantPattern, n.CategoryId)).ToList();
    }

    private async Task<(string Text, string? Pattern)> ValidateAsync(NoteInput input)
    {
        var text = input.Text?.Trim() ?? "";
        if (text.Length == 0) throw new DomainException("Poznámka nesmí být prázdná.");
        if (text.Length > MaxLength) throw new DomainException($"Poznámka je moc dlouhá ({text.Length} znaků, max {MaxLength}). Zkrať ji nebo ji rozděl.");
        var pattern = string.IsNullOrWhiteSpace(input.MerchantPattern) ? null : input.MerchantPattern.Trim();
        if (pattern is not null && (Text.Normalize(pattern).Length < 2 || pattern.Length > 100))
            throw new DomainException("Obchodník musí mít 2–100 znaků.");
        if (input.CategoryId is { } c && !await db.Categories.AnyAsync(x => x.Id == c))
            throw new DomainException($"Kategorie {c} neexistuje.");
        return (text, pattern);
    }

    private static string Trim(string actor) => actor.Length > 200 ? actor[..200] : actor;

    private static NoteDto ToDto(CategorizationNote n, IReadOnlyDictionary<int, string> paths) =>
        new(n.Id, n.Text, n.MerchantPattern, n.CategoryId, n.CategoryId is { } c ? paths.GetValueOrDefault(c) : null, n.CreatedBy, n.CreatedAt,
            n.UpdatedBy, n.UpdatedAt);
}

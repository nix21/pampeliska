using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record CategoryNode(int Id, int? ParentId, CategoryKind Kind, string Name, int Depth, int SortOrder, string Color, string? OwnColor,
    NeedType Need, NeedType EffectiveNeed, string? InheritedFrom, BudgetPeriod BudgetPeriod, decimal? BudgetAmount, bool CarryOver,
    bool IsFixed, string Path, int TopId);

public record CategoryInput(string? Name = null, CategoryKind? Kind = null, int? ParentId = null, bool SetParent = false, string? Color = null,
    NeedType? Need = null, BudgetPeriod? BudgetPeriod = null, decimal? BudgetAmount = null, bool SetBudget = false, bool? CarryOver = null,
    bool? IsFixed = null, int? SortOrder = null);

public record MergePreview(int Transactions, int Rules, int Children, string Source, string Target);

/// <summary>Strom kategorií: dědění typu výdaje a barvy, přesun, sloučení, mazání.</summary>
public class CategoryService(AppDbContext db)
{
    public static readonly string[] Palette = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12", "pos"];

    /// <summary>Kompletní strom v pořadí (předek před potomky, sourozenci podle SortOrder).</summary>
    public static List<CategoryNode> BuildTree(IReadOnlyCollection<Category> all)
    {
        var byParent = all.ToLookup(c => c.ParentId);
        var byId = all.ToDictionary(c => c.Id);
        var result = new List<CategoryNode>();
        void Walk(int? parentId, int depth, string path, Category? top, NeedType parentNeed, string? parentFrom)
        {
            foreach (var c in byParent[parentId].OrderBy(c => c.SortOrder).ThenBy(c => c.Name))
            {
                var t = top ?? c;
                var eff = c.Need == NeedType.Inherit ? parentNeed : c.Need;
                var from = c.Need == NeedType.Inherit ? parentFrom : c.Name;
                var p = path.Length == 0 ? c.Name : $"{path} › {c.Name}";
                result.Add(new CategoryNode(c.Id, c.ParentId, c.Kind, c.Name, depth, c.SortOrder, t.ColorToken ?? "c1", c.ColorToken, c.Need,
                    eff == NeedType.Inherit ? NeedType.None : eff, c.Need == NeedType.Inherit ? parentFrom : null,
                    c.BudgetPeriod, c.BudgetAmount, c.CarryOver, c.IsFixed, p, t.Id));
                Walk(c.Id, depth + 1, p, t, eff, from);
            }
        }
        Walk(null, 0, "", null, NeedType.None, null);
        _ = byId;
        return result;
    }

    public async Task<List<CategoryNode>> TreeAsync() => BuildTree(await db.Categories.AsNoTracking().ToListAsync());

    /// <summary>Id kategorie → „Nadřazená › Kategorie“.</summary>
    public static async Task<Dictionary<int, string>> PathsAsync(AppDbContext db) =>
        BuildTree(await db.Categories.AsNoTracking().ToListAsync()).ToDictionary(n => n.Id, n => n.Path);

    /// <summary>Id kategorie a všech jejích potomků.</summary>
    public static HashSet<int> WithDescendants(IReadOnlyCollection<Category> all, int id)
    {
        var set = new HashSet<int> { id };
        var byParent = all.ToLookup(c => c.ParentId);
        var stack = new Stack<int>([id]);
        while (stack.Count > 0)
            foreach (var ch in byParent[stack.Pop()])
                if (set.Add(ch.Id)) stack.Push(ch.Id);
        return set;
    }

    public async Task<Category> CreateAsync(CategoryInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) throw new DomainException("Kategorie musí mít název.");
        Category? parent = null;
        if (input.ParentId is { } pid)
            parent = await db.Categories.FindAsync(pid) ?? throw new DomainException($"Nadřazená kategorie {pid} neexistuje.");
        var kind = parent?.Kind ?? input.Kind ?? CategoryKind.Expense;
        if (input.Kind is { } k && parent is not null && k != parent.Kind)
            throw new DomainException("Podkategorie musí být stejného druhu (výdaj/příjem) jako nadřazená.");
        var siblings = await db.Categories.Where(c => c.ParentId == input.ParentId && c.Kind == kind).ToListAsync();
        if (siblings.Any(s => string.Equals(s.Name, input.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
            throw new DomainException($"Kategorie „{input.Name.Trim()}“ už na tomto místě existuje.");
        var c = new Category
        {
            Name = input.Name.Trim(), Kind = kind, ParentId = parent?.Id,
            ColorToken = parent is null ? ValidColor(input.Color) ?? NextColor(siblings) : null,
            Need = input.Need ?? NeedType.Inherit,
            SortOrder = input.SortOrder ?? (siblings.Count == 0 ? 0 : siblings.Max(s => s.SortOrder) + 1),
            IsFixed = input.IsFixed ?? false,
        };
        ApplyBudget(c, input);
        db.Categories.Add(c);
        await db.SaveChangesAsync();
        return c;
    }

    public async Task<Category> UpdateAsync(int id, CategoryInput input)
    {
        var c = await db.Categories.FindAsync(id) ?? throw new DomainException($"Kategorie {id} neexistuje.");
        if (input.Name is { } name)
        {
            if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Kategorie musí mít název.");
            c.Name = name.Trim();
        }
        if (input.SetParent) await MoveAsync(c, input.ParentId);
        if (input.Color is not null)
        {
            if (c.ParentId is not null) throw new DomainException("Barvu má jen hlavní kategorie, podkategorie přebírají její odstín.");
            c.ColorToken = ValidColor(input.Color) ?? throw new DomainException($"Neznámá barva {input.Color}.");
        }
        if (input.Need is { } need) c.Need = need;
        if (input.IsFixed is { } fixedCost) c.IsFixed = fixedCost;
        if (input.SortOrder is { } order) await ReorderAsync(c, order);
        ApplyBudget(c, input);
        await db.SaveChangesAsync();
        return c;
    }

    private static void ApplyBudget(Category c, CategoryInput input)
    {
        if (input.BudgetPeriod is { } period)
        {
            c.BudgetPeriod = period;
            if (period == BudgetPeriod.None) c.BudgetAmount = null;
        }
        if (input.SetBudget || input.BudgetAmount is not null)
        {
            if (input.BudgetAmount is < 0) throw new DomainException("Rozpočet nesmí být záporný.");
            c.BudgetAmount = input.BudgetAmount;
            if (input.BudgetAmount is null) c.BudgetPeriod = BudgetPeriod.None;
            else if (c.BudgetPeriod == BudgetPeriod.None) c.BudgetPeriod = BudgetPeriod.Monthly;
        }
        if (input.CarryOver is { } carry) c.CarryOver = carry;
        if (c.Kind == CategoryKind.Income && c.BudgetPeriod != BudgetPeriod.None)
            throw new DomainException("Rozpočet lze nastavit jen u výdajových kategorií.");
    }

    private async Task MoveAsync(Category c, int? newParentId)
    {
        if (newParentId == c.ParentId) return;
        var all = await db.Categories.ToListAsync();
        if (newParentId is { } pid)
        {
            var parent = all.FirstOrDefault(x => x.Id == pid) ?? throw new DomainException($"Kategorie {pid} neexistuje.");
            if (WithDescendants(all, c.Id).Contains(pid)) throw new DomainException("Kategorii nelze přesunout pod sebe samu ani pod vlastní podkategorii.");
            if (parent.Kind != c.Kind) throw new DomainException("Výdajovou kategorii nelze přesunout mezi příjmy (a naopak).");
        }
        // Když se z podkategorie stává hlavní, převezme barvu své dosavadní hlavní kategorie
        if (newParentId is null && c.ParentId is not null)
        {
            var top = c;
            while (top.ParentId is { } p) top = all.First(x => x.Id == p);
            c.ColorToken = top.ColorToken;
        }
        if (newParentId is not null) c.ColorToken = null;
        c.ParentId = newParentId;
        c.SortOrder = all.Where(x => x.ParentId == newParentId && x.Id != c.Id).Select(x => x.SortOrder).DefaultIfEmpty(-1).Max() + 1;
    }

    private async Task ReorderAsync(Category c, int position)
    {
        var siblings = await db.Categories.Where(x => x.ParentId == c.ParentId && x.Kind == c.Kind && x.Id != c.Id)
            .OrderBy(x => x.SortOrder).ToListAsync();
        position = Math.Clamp(position, 0, siblings.Count);
        siblings.Insert(position, c);
        for (var i = 0; i < siblings.Count; i++) siblings[i].SortOrder = i;
    }

    public async Task<MergePreview> MergePreviewAsync(int sourceId, int targetId)
    {
        var (source, target, all) = await LoadMergeAsync(sourceId, targetId);
        var ids = WithDescendants(all, sourceId);
        ids.Remove(sourceId);
        var tx = await db.Transactions.CountAsync(t => t.CategoryId == sourceId) + await db.TransactionSplits.CountAsync(s => s.CategoryId == sourceId);
        var rules = await db.Rules.CountAsync(r => r.CategoryId == sourceId);
        return new MergePreview(tx, rules, all.Count(c => c.ParentId == sourceId), source.Name, target.Name);
    }

    private async Task<(Category source, Category target, List<Category> all)> LoadMergeAsync(int sourceId, int targetId)
    {
        var all = await db.Categories.ToListAsync();
        var source = all.FirstOrDefault(c => c.Id == sourceId) ?? throw new DomainException($"Kategorie {sourceId} neexistuje.");
        var target = all.FirstOrDefault(c => c.Id == targetId) ?? throw new DomainException($"Kategorie {targetId} neexistuje.");
        if (WithDescendants(all, sourceId).Contains(targetId)) throw new DomainException("Kategorii nelze sloučit do sebe ani do vlastní podkategorie.");
        if (source.Kind != target.Kind) throw new DomainException("Výdajovou a příjmovou kategorii nelze sloučit.");
        return (source, target, all);
    }

    /// <summary>
    /// Sloučí kategorii do cíle: přesune platby (i části rozdělených), pravidla, pravidelné platby, osobní rozpočty a podkategorie.
    /// Rozpočet se přičte k cíli, pokud mají stejnou periodu. Zdrojová kategorie zanikne.
    /// </summary>
    public async Task<MergePreview> MergeAsync(int sourceId, int targetId)
    {
        var preview = await MergePreviewAsync(sourceId, targetId);
        var (source, target, all) = await LoadMergeAsync(sourceId, targetId);
        await db.Transactions.Where(t => t.CategoryId == sourceId).ExecuteOrLoadUpdateAsync(db, t => t.CategoryId = targetId);
        foreach (var s in await db.TransactionSplits.Where(s => s.CategoryId == sourceId).ToListAsync()) s.CategoryId = targetId;
        foreach (var r in await db.Rules.Where(r => r.CategoryId == sourceId).ToListAsync()) r.CategoryId = targetId;
        foreach (var r in await db.RecurringPayments.Where(r => r.CategoryId == sourceId).ToListAsync()) r.CategoryId = targetId;
        foreach (var n in await db.CategorizationNotes.Where(n => n.CategoryId == sourceId).ToListAsync()) n.CategoryId = targetId;
        foreach (var d in await db.RuleSuggestionDismissals.Where(d => d.CategoryId == sourceId).ToListAsync()) db.RuleSuggestionDismissals.Remove(d);
        var targetBudgets = await db.MemberBudgets.Where(b => b.CategoryId == targetId).ToListAsync();
        foreach (var b in await db.MemberBudgets.Where(b => b.CategoryId == sourceId).ToListAsync())
        {
            var tb = targetBudgets.FirstOrDefault(x => x.MemberId == b.MemberId);
            if (tb is null) b.CategoryId = targetId;
            else
            {
                if (tb.Period == b.Period) tb.Amount += b.Amount;
                db.MemberBudgets.Remove(b);
            }
        }
        var order = all.Where(c => c.ParentId == targetId).Select(c => c.SortOrder).DefaultIfEmpty(-1).Max() + 1;
        foreach (var child in all.Where(c => c.ParentId == sourceId).OrderBy(c => c.SortOrder))
        {
            child.ParentId = targetId;
            child.ColorToken = null;
            child.SortOrder = order++;
        }
        if (source.BudgetAmount is { } amount && source.BudgetPeriod != BudgetPeriod.None)
        {
            if (target.BudgetPeriod == BudgetPeriod.None)
            {
                target.BudgetPeriod = source.BudgetPeriod;
                target.BudgetAmount = amount;
            }
            else if (target.BudgetPeriod == source.BudgetPeriod) target.BudgetAmount = (target.BudgetAmount ?? 0) + amount;
        }
        await db.SaveChangesAsync();
        db.Categories.Remove(source);
        await db.SaveChangesAsync();
        return preview;
    }

    /// <summary>Smaže kategorii, jen pokud nemá platby, podkategorie ani pravidla.</summary>
    public async Task DeleteAsync(int id)
    {
        var c = await db.Categories.FindAsync(id) ?? throw new DomainException($"Kategorie {id} neexistuje.");
        if (await db.Transactions.AnyAsync(t => t.CategoryId == id) || await db.TransactionSplits.AnyAsync(s => s.CategoryId == id))
            throw new DomainException($"Kategorie „{c.Name}“ má platby. Nejdřív ji slouč do jiné.");
        if (await db.Categories.AnyAsync(x => x.ParentId == id))
            throw new DomainException($"Kategorie „{c.Name}“ má podkategorie. Nejdřív je přesuň nebo slouč.");
        if (await db.Rules.AnyAsync(r => r.CategoryId == id))
            throw new DomainException($"Na kategorii „{c.Name}“ odkazují pravidla. Nejdřív je smaž nebo změň, případně kategorii slouč.");
        foreach (var r in await db.RecurringPayments.Where(r => r.CategoryId == id).ToListAsync()) r.CategoryId = null;
        foreach (var n in await db.CategorizationNotes.Where(n => n.CategoryId == id).ToListAsync()) n.CategoryId = null;
        db.MemberBudgets.RemoveRange(await db.MemberBudgets.Where(b => b.CategoryId == id).ToListAsync());
        db.RuleSuggestionDismissals.RemoveRange(await db.RuleSuggestionDismissals.Where(b => b.CategoryId == id).ToListAsync());
        db.Categories.Remove(c);
        await db.SaveChangesAsync();
    }

    private static string? ValidColor(string? color) =>
        color is null ? null : Palette.Contains(color.Trim().TrimStart('-').Replace("--", "")) ? color.Trim().TrimStart('-') : null;

    private static string NextColor(List<Category> siblings)
    {
        var used = siblings.Select(s => s.ColorToken).ToHashSet();
        return Palette.FirstOrDefault(p => !used.Contains(p) && p != "pos") ?? "c1";
    }
}

internal static class QueryExtensions
{
    /// <summary>Hromadná změna přes načtení (přenositelné i na InMemory provider v testech).</summary>
    public static async Task ExecuteOrLoadUpdateAsync<T>(this IQueryable<T> query, AppDbContext db, Action<T> update) where T : class
    {
        foreach (var e in await query.ToListAsync()) update(e);
        _ = db;
    }
}

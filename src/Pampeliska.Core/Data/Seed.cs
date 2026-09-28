using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Data;

/// <summary>Uzel šablony stromu kategorií.</summary>
public record CategoryTemplateNode(string Name, NeedType Need = NeedType.Inherit, string? Color = null, CategoryTemplateNode[]? Children = null);

public record CategoryTemplate(string Key, string Label, string Note, CategoryTemplateNode[] Expense, CategoryTemplateNode[] Income);

public static class Seed
{
    public static readonly Institution[] Institutions =
    [
        new() { Key = "cs", Name = "Česká spořitelna", Abbrev = "ČS", Color = "#1B5EB5", Kind = InstitutionKind.Bank, SortOrder = 1 },
        new() { Key = "fio", Name = "Fio banka", Abbrev = "Fio", Color = "#2E7D4F", Kind = InstitutionKind.Bank, SortOrder = 2 },
        new() { Key = "rb", Name = "Raiffeisenbank", Abbrev = "RB", Color = "#B08A00", Kind = InstitutionKind.Bank, SortOrder = 3 },
        new() { Key = "ab", Name = "Air Bank", Abbrev = "AB", Color = "#5E9E1E", Kind = InstitutionKind.Bank, SortOrder = 4 },
        new() { Key = "kb", Name = "Komerční banka", Abbrev = "KB", Color = "#B3261E", Kind = InstitutionKind.Bank, SortOrder = 5 },
        new() { Key = "csob", Name = "ČSOB", Abbrev = "ČSOB", Color = "#0B3A74", Kind = InstitutionKind.Bank, SortOrder = 6 },
        new() { Key = "mb", Name = "mBank", Abbrev = "mB", Color = "#1F7A8C", Kind = InstitutionKind.Bank, SortOrder = 7 },
        new() { Key = "pb", Name = "Partners Banka", Abbrev = "PB", Color = "#0E7C66", Kind = InstitutionKind.Bank, SortOrder = 8 },
        new() { Key = "rev", Name = "Revolut", Abbrev = "R", Color = "#1D1B16", Kind = InstitutionKind.Bank, SortOrder = 9 },
        new() { Key = "oth", Name = "Jiná banka", Abbrev = "?", Color = "#6B6557", Kind = InstitutionKind.Bank, SortOrder = 99 },
        new() { Key = "xtb", Name = "XTB", Abbrev = "XTB", Color = "#C9402F", Kind = InstitutionKind.Broker, SortOrder = 101 },
        new() { Key = "portu", Name = "Portu", Abbrev = "P", Color = "#3C6E9F", Kind = InstitutionKind.Broker, SortOrder = 102 },
        new() { Key = "t212", Name = "Trading 212", Abbrev = "212", Color = "#1A6FDB", Kind = InstitutionKind.Broker, SortOrder = 103 },
        new() { Key = "fioeb", Name = "Fio e-Broker", Abbrev = "Fio", Color = "#2E7D4F", Kind = InstitutionKind.Broker, SortOrder = 104 },
        new() { Key = "conseq", Name = "Conseq", Abbrev = "CQ", Color = "#1F4E8C", Kind = InstitutionKind.Broker, SortOrder = 105 },
        new() { Key = "amundi", Name = "Amundi", Abbrev = "AM", Color = "#0A2F6B", Kind = InstitutionKind.Broker, SortOrder = 106 },
        new() { Key = "stav", Name = "Stavební spořitelna", Abbrev = "SS", Color = "#D0602A", Kind = InstitutionKind.Broker, SortOrder = 107 },
        new() { Key = "pen", Name = "Penzijní společnost", Abbrev = "PS", Color = "#7A5C99", Kind = InstitutionKind.Broker, SortOrder = 108 },
        new() { Key = "othb", Name = "Jiná platforma", Abbrev = "?", Color = "#6B6557", Kind = InstitutionKind.Broker, SortOrder = 199 },
    ];

    private static CategoryTemplateNode N(string name, NeedType need = NeedType.Inherit, params CategoryTemplateNode[] children) =>
        new(name, need, null, children.Length > 0 ? children : null);

    private static CategoryTemplateNode Top(string name, string color, NeedType need, params CategoryTemplateNode[] children) =>
        new(name, need, color, children);

    private const NeedType Need = NeedType.Need, Joy = NeedType.Joy, None = NeedType.None, Inh = NeedType.Inherit;

    public static readonly CategoryTemplate[] CategoryTemplates =
    [
        new("rec", "Doporučený", "12 kategorií · až 3 úrovně",
        [
            Top("Bydlení", "c1", Need, N("Hypotéka / nájem"), N("SVJ a fond oprav"), N("Energie", Inh, N("Elektřina"), N("Plyn"), N("Voda"))),
            Top("Jídlo", "c2", Need, N("Supermarkety"), N("Obědy"), N("Večeře", Joy), N("Restaurace", Joy), N("Kavárny", Joy)),
            Top("Elektronika a domácnost", "c3", Inh, N("Elektronika", Joy), N("Drogerie", Need), N("Vybavení domácnosti", Need)),
            Top("Volný čas", "c4", Joy, N("Dovolená"), N("Sport"), N("Kultura"), N("Hobby")),
            Top("Doprava", "c5", Need, N("Palivo"), N("Parkování", None), N("MHD"), N("Servis auta")),
            Top("Děti", "c6", Need, N("Kroužky"), N("Oblečení", None), N("Škola"), N("Kapesné")),
            Top("Předplatné a služby", "c7", Inh, N("Telefon a internet", Need), N("Streaming", Joy), N("Hudba", Joy), N("Software")),
            Top("Pojištění", "c9", Need, N("Pojištění auta"), N("Životní pojištění"), N("Pojištění domácnosti")),
            Top("Zdraví", "c8", Need, N("Lékárna"), N("Lékař"), N("Optika")),
            Top("Dárky a charita", "c10", Joy, N("Dárky"), N("Charita")),
            Top("Vzdělávání", "c12", Joy, N("Kurzy"), N("Knihy")),
            Top("Mazlíčci", "c11", Need, N("Krmivo"), N("Veterinář")),
        ],
        [
            Top("Mzda", "c3", None),
            Top("Ostatní příjmy", "c1", None, N("Úroky"), N("Prodej věcí"), N("Ostatní")),
        ]),
        new("det", "Podrobný", "12 kategorií · až 3 úrovně, více podkategorií",
        [
            Top("Bydlení", "c1", Need, N("Hypotéka / nájem"), N("SVJ a fond oprav"),
                N("Energie", Inh, N("Elektřina"), N("Plyn"), N("Voda")), N("Údržba a opravy"), N("Internet")),
            Top("Jídlo", "c2", Need, N("Supermarkety"), N("Obědy"), N("Večeře", Joy), N("Restaurace", Joy), N("Kavárny", Joy), N("Rozvoz", Joy)),
            Top("Elektronika a domácnost", "c3", Inh, N("Elektronika", Joy), N("Drogerie", Need), N("Vybavení domácnosti", Need),
                N("Nářadí a zahrada", Need), N("Dekorace", Joy), N("Úklid", Need)),
            Top("Volný čas", "c4", Joy, N("Sport"), N("Kultura"), N("Hobby"),
                N("Dovolená", Inh, N("Ubytování"), N("Doprava na dovolené"), N("Útrata na dovolené"))),
            Top("Doprava", "c5", Need, N("Auto", Inh, N("Palivo"), N("Servis auta"), N("Dálniční známka")), N("Parkování", None), N("MHD"), N("Vlaky")),
            Top("Děti", "c6", Need, N("Kroužky"), N("Oblečení", None), N("Škola"), N("Kapesné")),
            Top("Předplatné a služby", "c7", Inh, N("Telefon", Need), N("Streaming", Joy), N("Hudba", Joy), N("Software")),
            Top("Pojištění", "c9", Need, N("Pojištění auta"), N("Životní pojištění"), N("Pojištění domácnosti")),
            Top("Zdraví", "c8", Need, N("Lékárna"), N("Lékař"), N("Brýle")),
            Top("Dárky a charita", "c10", Joy, N("Dárky"), N("Charita")),
            Top("Vzdělávání", "c12", Joy, N("Kurzy"), N("Knihy")),
            Top("Mazlíčci", "c11", Need, N("Krmivo"), N("Veterinář")),
        ],
        [
            Top("Mzda", "c3", None),
            Top("Bonusy", "c5", None),
            Top("Ostatní příjmy", "c1", None, N("Úroky"), N("Prodej věcí"), N("Ostatní")),
        ]),
        new("min", "Minimální", "Jen nezbytné / pro radost",
        [
            Top("Nezbytné", "c1", Need),
            Top("Pro radost", "c4", Joy),
        ],
        [
            Top("Příjmy", "c3", None),
        ]),
    ];

    public static async Task EnsureAsync(AppDbContext db, TimeProvider? time = null)
    {
        var now = (time ?? TimeProvider.System).GetUtcNow();
        if (!await db.Households.AnyAsync())
            db.Households.Add(new Household { Name = "Domácnost", CreatedAt = now });
        var existing = await db.Institutions.Select(i => i.Key).ToListAsync();
        foreach (var i in Institutions.Where(i => !existing.Contains(i.Key)))
            db.Institutions.Add(new Institution { Key = i.Key, Name = i.Name, Abbrev = i.Abbrev, Color = i.Color, Kind = i.Kind, SortOrder = i.SortOrder });
        await db.SaveChangesAsync();
    }

    /// <summary>Založí strom kategorií podle šablony (jen když ještě žádné kategorie nejsou).</summary>
    public static async Task ApplyCategoryTemplateAsync(AppDbContext db, string key)
    {
        var tpl = CategoryTemplates.FirstOrDefault(t => t.Key == key) ?? throw new DomainException($"Neznámá šablona kategorií {key}.");
        if (await db.Categories.AnyAsync()) throw new DomainException("Kategorie už existují, šablonu nelze použít znovu.");
        Add(db, tpl.Expense, CategoryKind.Expense, null);
        Add(db, tpl.Income, CategoryKind.Income, null);
        await db.SaveChangesAsync();
    }

    private static void Add(AppDbContext db, CategoryTemplateNode[] nodes, CategoryKind kind, Category? parent)
    {
        var order = 0;
        foreach (var n in nodes)
        {
            var c = new Category
            {
                Name = n.Name, Kind = kind, Parent = parent, SortOrder = order++, Need = n.Need,
                ColorToken = parent is null ? n.Color ?? "c1" : null,
            };
            db.Categories.Add(c);
            if (n.Children is { } ch) Add(db, ch, kind, c);
        }
    }
}

using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record SavingTipDto(int Id, string Title, string Body, string Topic, decimal MonthlySaving, string? SavingLabel, string? Evidence,
    IReadOnlyList<int> TransactionIds, string? Search, int? MemberId, SavingTipStatus Status, DateOnly Since, string CreatedBy,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record SavingTipInput(string Title, string Body, string Topic, decimal MonthlySaving = 0, string? SavingLabel = null, string? Evidence = null,
    IReadOnlyList<int>? TransactionIds = null, string? Search = null, int? MemberId = null);

/// <summary>Kde ušetřit: rady od AI se stavem (aktivní / skrytá / odmítnutá).</summary>
public class SavingTipService(AppDbContext db, TimeProvider time)
{
    public const int TitleMax = 200;
    public const int BodyMax = 2000;
    public const int TopicMax = 40;
    public const int LabelMax = 60;
    public const int EvidenceMax = 300;
    public const int MaxTips = 200;
    public const int MaxTransactions = 300;

    public async Task<List<SavingTipDto>> ListAsync(SavingTipStatus? status = null)
    {
        var q = db.SavingTips.AsNoTracking();
        if (status is { } s) q = q.Where(t => t.Status == s);
        return (await q.OrderByDescending(t => t.Since).ThenByDescending(t => t.MonthlySaving).ThenBy(t => t.Id).ToListAsync()).Select(ToDto).ToList();
    }

    public async Task<SavingTipDto> GetAsync(int id) => ToDto(await FindAsync(id, tracking: false));

    public async Task<SavingTipDto> CreateAsync(SavingTipInput input, string actor)
    {
        if (await db.SavingTips.CountAsync() >= MaxTips)
            throw new DomainException($"Rad je už {MaxTips}. Smaž zastaralé (delete_saving_tip), než přidáš další.");
        var t = new SavingTip { Title = "", Body = "", Topic = "", CreatedBy = actor.Length > 200 ? actor[..200] : actor };
        await ApplyAsync(t, input);
        t.Status = SavingTipStatus.Active;
        t.Since = time.Today();
        t.CreatedAt = t.UpdatedAt = time.GetUtcNow();
        db.SavingTips.Add(t);
        await db.SaveChangesAsync();
        return ToDto(t);
    }

    /// <summary>Nahradí obsah rady (stav a měsíc, od kdy platí, se nemění).</summary>
    public async Task<SavingTipDto> UpdateAsync(int id, SavingTipInput input)
    {
        var t = await FindAsync(id);
        await ApplyAsync(t, input);
        t.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync();
        return ToDto(t);
    }

    /// <summary>Skrýt / odmítnout / vrátit mezi rady. Vrácená rada se znovu objeví v aktuálním měsíci.</summary>
    public async Task<SavingTipDto> SetStatusAsync(int id, SavingTipStatus status)
    {
        var t = await FindAsync(id);
        if (t.Status == status) return ToDto(t);
        if (status == SavingTipStatus.Active) t.Since = time.Today();
        t.Status = status;
        t.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync();
        return ToDto(t);
    }

    public async Task DeleteAsync(int id)
    {
        var t = await FindAsync(id);
        if (t.Status == SavingTipStatus.Rejected)
            throw new DomainException("Odmítnutou radu nejde smazat – AI z ní pozná, co už nenabízet.");
        db.SavingTips.Remove(t);
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<int>> TransactionIdsAsync(int id) => ParseIds((await FindAsync(id, tracking: false)).TransactionIds);

    private async Task<SavingTip> FindAsync(int id, bool tracking = true) =>
        await (tracking ? db.SavingTips : db.SavingTips.AsNoTracking()).FirstOrDefaultAsync(t => t.Id == id)
        ?? throw new DomainException($"Rada {id} neexistuje.");

    private async Task ApplyAsync(SavingTip t, SavingTipInput i)
    {
        string Req(string? v, int max, string what)
        {
            var s = v?.Trim() ?? "";
            if (s.Length == 0) throw new DomainException($"{what} nesmí být prázdný.");
            if (s.Length > max) throw new DomainException($"{what} je moc dlouhý ({s.Length} znaků, max {max}).");
            return s;
        }
        string? Opt(string? v, int max, string what)
        {
            var s = v?.Trim();
            if (string.IsNullOrEmpty(s)) return null;
            if (s.Length > max) throw new DomainException($"{what} je moc dlouhý ({s.Length} znaků, max {max}).");
            return s;
        }

        t.Title = Req(i.Title, TitleMax, "Nadpis rady");
        t.Body = Req(i.Body, BodyMax, "Text rady");
        t.Topic = Req(i.Topic, TopicMax, "Štítek oblasti");
        if (i.MonthlySaving < 0 || i.MonthlySaving > 1_000_000) throw new DomainException("Úspora za měsíc musí být 0–1 000 000 Kč.");
        t.MonthlySaving = Math.Round(i.MonthlySaving, 2);
        t.SavingLabel = Opt(i.SavingLabel, LabelMax, "Popisek úspory");
        t.Evidence = Opt(i.Evidence, EvidenceMax, "Popis podkladů");
        t.Search = Opt(i.Search, 100, "Hledaný text");

        var ids = (i.TransactionIds ?? []).Distinct().ToList();
        if (ids.Count > MaxTransactions) throw new DomainException($"K radě jde připojit nejvýš {MaxTransactions} pohybů.");
        if (ids.Count > 0)
        {
            var found = await db.Transactions.Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync();
            var missing = ids.Except(found).ToList();
            if (missing.Count > 0) throw new DomainException($"Pohyby {string.Join(", ", missing.Take(10))} neexistují.");
        }
        t.TransactionIds = ids.Count > 0 ? string.Join(',', ids) : null;

        if (i.MemberId is { } m && !await db.Members.AnyAsync(x => x.Id == m)) throw new DomainException($"Člen {m} neexistuje.");
        t.MemberId = i.MemberId;
    }

    private static List<int> ParseIds(string? s) =>
        string.IsNullOrEmpty(s) ? [] : s.Split(',').Select(x => int.TryParse(x, out var v) ? v : 0).Where(v => v > 0).ToList();

    private static SavingTipDto ToDto(SavingTip t) => new(t.Id, t.Title, t.Body, t.Topic, t.MonthlySaving, t.SavingLabel, t.Evidence,
        ParseIds(t.TransactionIds), t.Search, t.MemberId, t.Status, t.Since, t.CreatedBy, t.CreatedAt, t.UpdatedAt);
}

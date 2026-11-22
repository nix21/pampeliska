using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

/// <summary>Heslo bez hodnoty – hodnota se po uložení nikdy nevrací.</summary>
public record StatementPasswordRow(int Id, string Label, string? SenderDomain, string? SenderName, DateTimeOffset? LastUsedAt, string? LastUsedDomain,
    DateTimeOffset CreatedAt);

/// <summary>
/// Hesla k zamčeným PDF výpisům. Hodnoty jsou zašifrované přes Data Protection (klíče na disku serveru),
/// odemknou se jen při otevírání PDF a nikam se neposílají.
/// </summary>
public class StatementPasswordService(AppDbContext db, IDataProtectionProvider dataProtection, InboundEmailQueue queue, TimeProvider time)
{
    public const int MaxPasswords = 30;
    private readonly IDataProtector _protector = dataProtection.CreateProtector("Pampeliska.StatementPasswords.v1");

    public async Task<IReadOnlyList<StatementPasswordRow>> ListAsync() =>
        (await db.StatementPasswords.AsNoTracking().OrderBy(p => p.Label).ThenBy(p => p.Id).ToListAsync())
        .Select(p => new StatementPasswordRow(p.Id, p.Label, p.SenderDomain, p.SenderDomain is { } d ? KnownBanks.Find(d)?.Name ?? d : null,
            p.LastUsedAt, p.LastUsedDomain, p.CreatedAt)).ToList();

    public async Task<StatementPasswordRow> AddAsync(string label, string value, string? senderDomain)
    {
        if (await db.StatementPasswords.CountAsync() >= MaxPasswords) throw new DomainException($"Uložit jde nejvýš {MaxPasswords} hesel.");
        var p = new StatementPassword
        {
            Label = CleanLabel(label), ProtectedValue = _protector.Protect(CleanValue(value)), SenderDomain = CleanDomain(senderDomain),
            CreatedAt = time.GetUtcNow(),
        };
        db.StatementPasswords.Add(p);
        await db.SaveChangesAsync();
        await RetryLockedAsync();
        return (await ListAsync()).First(r => r.Id == p.Id);
    }

    /// <summary>Úprava popisku, banky nebo hodnoty (prázdná hodnota = beze změny).</summary>
    public async Task UpdateAsync(int id, string label, string? value, string? senderDomain)
    {
        var p = await db.StatementPasswords.FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Heslo {id} neexistuje.");
        p.Label = CleanLabel(label);
        p.SenderDomain = CleanDomain(senderDomain);
        if (!string.IsNullOrEmpty(value)) p.ProtectedValue = _protector.Protect(CleanValue(value));
        await db.SaveChangesAsync();
        await RetryLockedAsync();
    }

    /// <summary>Nové heslo → zamčené výpisy se zkusí zpracovat znovu.</summary>
    private async Task RetryLockedAsync()
    {
        foreach (var id in await db.InboundEmails.Where(m => m.State == InboundEmailState.NeedsPassword).Select(m => m.Id).ToListAsync())
            queue.Enqueue(id);
    }

    public async Task DeleteAsync(int id)
    {
        var p = await db.StatementPasswords.FirstOrDefaultAsync(x => x.Id == id) ?? throw new DomainException($"Heslo {id} neexistuje.");
        db.StatementPasswords.Remove(p);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Hesla k vyzkoušení pro výpis od <paramref name="senderDomain"/>: nejdřív ta, která u té banky už fungovala nebo jsou k ní
    /// přiřazená, pak obecná, nakonec hesla jiných bank. Heslo, které nejde dešifrovat (ztracené klíče), se přeskočí.
    /// </summary>
    public async Task<IReadOnlyList<(int Id, string Password)>> CandidatesAsync(string? senderDomain)
    {
        var all = await db.StatementPasswords.AsNoTracking().ToListAsync();
        bool Of(string? d) => d is not null && senderDomain is not null && KnownBanks.DomainMatches(senderDomain, d);
        var list = new List<(int, string)>();
        foreach (var p in all.OrderBy(p => Of(p.LastUsedDomain) ? 0 : Of(p.SenderDomain) ? 1 : p.SenderDomain is null ? 2 : 3)
                     .ThenByDescending(p => p.LastUsedAt).ThenBy(p => p.Id))
        {
            try { list.Add((p.Id, _protector.Unprotect(p.ProtectedValue))); }
            catch (CryptographicException) { /* klíče Data Protection se změnily – heslo je potřeba zadat znovu */ }
        }
        return list;
    }

    public async Task MarkUsedAsync(int id, string? senderDomain)
    {
        var p = await db.StatementPasswords.FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return;
        p.LastUsedAt = time.GetUtcNow();
        p.LastUsedDomain = senderDomain;
        await db.SaveChangesAsync();
    }

    private static string CleanLabel(string? label)
    {
        var l = label?.Trim() ?? "";
        if (l.Length == 0) throw new DomainException("Zadejte popisek hesla, např. „RČ – poslední 4 číslice“.");
        return l.Length > 100 ? l[..100] : l;
    }

    private static string CleanValue(string? value)
    {
        var v = value?.Trim() ?? "";
        if (v.Length == 0) throw new DomainException("Zadejte heslo.");
        if (v.Length > 128) throw new DomainException("Heslo je příliš dlouhé.");
        return v;
    }

    private static string? CleanDomain(string? domain)
    {
        if (string.IsNullOrWhiteSpace(domain)) return null;
        var d = domain.Trim().ToLowerInvariant().TrimStart('@');
        if (d.Contains('@')) d = d[(d.IndexOf('@') + 1)..];
        if (!d.Contains('.') || d.Length > 253) throw new DomainException($"„{domain}“ není platná doména banky.");
        return d;
    }
}

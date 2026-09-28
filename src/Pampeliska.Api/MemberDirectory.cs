using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Api;

/// <summary>
/// Kdo se smí přihlásit: e-maily členů domácnosti z DB + <c>Auth:OwnerEmails</c> z konfigurace (bootstrap prvního vlastníka).
/// Seznam se drží v paměti; po změně členů se volá <see cref="Invalidate"/>.
/// </summary>
public sealed class MemberDirectory(IServiceScopeFactory scopes, IConfiguration config, TimeProvider time)
{
    private readonly HashSet<string> _owners = Parse(config["Auth:OwnerEmails"]);
    private volatile HashSet<string>? _members;
    private readonly Lock _gate = new();

    public string? FirstOwner => Parse(config["Auth:OwnerEmails"]).FirstOrDefault();

    public static HashSet<string> Parse(string? value) =>
        (value ?? "").Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries)
            .Select(e => e.Trim().ToLowerInvariant()).Where(e => e.Length > 0).ToHashSet();

    public bool Contains(string? email)
    {
        if (string.IsNullOrEmpty(email)) return false;
        var e = email.ToLowerInvariant();
        return _owners.Contains(e) || Members().Contains(e);
    }

    public void Invalidate() => _members = null;

    private HashSet<string> Members()
    {
        var set = _members;
        if (set is not null) return set;
        lock (_gate)
        {
            if (_members is not null) return _members;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            _members = db.Members.AsNoTracking().Select(m => m.Email).ToList().Select(e => e.ToLowerInvariant()).ToHashSet();
            return _members;
        }
    }

    /// <summary>Po přihlášení: pozvaný člen se stane aktivním, vlastník z konfigurace se založí, pokud ještě neexistuje.</summary>
    public async Task OnLoginAsync(string email, string? name)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lower = email.ToLowerInvariant();
        var member = await db.Members.FirstOrDefaultAsync(m => m.Email == lower);
        var now = time.GetUtcNow();
        if (member is null)
        {
            if (!_owners.Contains(lower)) return;
            var hasOwner = await db.Members.AnyAsync(m => m.Role == MemberRole.Owner);
            member = new Member
            {
                Name = FirstName(name) ?? lower.Split('@')[0], Email = lower, ColorToken = "c1",
                Role = hasOwner ? MemberRole.Member : MemberRole.Owner, CreatedAt = now,
                SortOrder = await db.Members.CountAsync(),
            };
            db.Members.Add(member);
        }
        member.Status = MemberStatus.Active;
        member.LastLoginAt = now;
        await db.SaveChangesAsync();
        Invalidate();
    }

    public static string? FirstName(string? name) =>
        string.IsNullOrWhiteSpace(name) ? null : name.Trim().Split(' ')[0];
}

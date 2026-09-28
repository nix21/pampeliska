using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record NotificationDto(int Id, NotificationType Type, NotificationSeverity Severity, string Title, string Text, int? AccountId, int? RecurringPaymentId,
    DateTimeOffset CreatedAt);

public record Badges(int Inbox, int Batches, int RecurringAlerts, int Notifications);

/// <summary>Upozornění v aplikaci (nízký zůstatek, nesplněné podmínky, chybějící platby) – plní je denní kontrola.</summary>
public class NotificationService(AppDbContext db, RecurringService recurring, ForecastService forecast, ConditionService conditions,
    InboxService inbox, TimeProvider time) : IDailyCheck
{
    public async Task RunAsync(CancellationToken ct)
    {
        var settings = (await db.Households.AsNoTracking().FirstAsync(ct)).Settings;
        if (!settings.OnboardingDone) return;
        await recurring.DetectAsync();
        var active = new Dictionary<string, Notification>();
        var now = time.GetUtcNow();
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id, a => a.Name, ct);
        if (settings.NotifyLowBalance)
            foreach (var f in (await forecast.ForecastAsync(30)).Where(f => f.Low))
                active[$"low:{f.AccountId}:{f.MinDate:yyyyMMdd}"] = new Notification
                {
                    Type = NotificationType.LowBalance, Severity = NotificationSeverity.Danger, AccountId = f.AccountId, Key = "",
                    Title = $"{accounts.GetValueOrDefault(f.AccountId)}: doplnit {f.TopUp:N0} {f.Currency}",
                    Text = $"{f.MinDate:d. M.} klesne zůstatek na {f.Min:N0} {f.Currency}, pod limit {f.Limit:N0} {f.Currency}.",
                };
        if (settings.NotifyConditions)
            foreach (var c in (await conditions.EvaluateAsync()).Items.Where(c => c.State == ConditionState.Urgent))
                active[$"cond:{c.ConditionId}:{c.PeriodEnd:yyyyMM}"] = new Notification
                {
                    Type = NotificationType.Condition, Severity = NotificationSeverity.Warning, AccountId = c.AccountId, Key = "",
                    Title = $"{accounts.GetValueOrDefault(c.AccountId)}: nesplněná podmínka",
                    Text = $"Do {c.PeriodEnd:d. M.} chybí {Describe(c)}{(c.Benefit is { } b ? $" · jinak přijdete o: {b}" : "")}.",
                };
        foreach (var a in await recurring.AlertsAsync())
            active[$"rec:{a.Kind}:{a.RecurringId}:{a.Due:yyyyMMdd}"] = new Notification
            {
                Type = a.Kind == "missing" ? NotificationType.MissingRecurring : NotificationType.RecurringAmountChanged,
                Severity = a.Kind == "missing" ? NotificationSeverity.Danger : NotificationSeverity.Warning,
                RecurringPaymentId = a.RecurringId, Key = "", Title = a.Title, Text = a.Text,
            };

        var existing = await db.Notifications.Where(n => n.DismissedAt == null).ToListAsync(ct);
        foreach (var n in existing.Where(n => !active.ContainsKey(n.Key))) n.DismissedAt = now;
        var known = await db.Notifications.Select(n => n.Key).ToListAsync(ct);
        foreach (var (key, n) in active.Where(kv => !known.Contains(kv.Key)))
        {
            n.Key = key;
            n.CreatedAt = now;
            db.Notifications.Add(n);
        }
        await db.SaveChangesAsync(ct);
    }

    private static string Describe(ConditionStatus c) => c.Type switch
    {
        ConditionType.CardCount => $"{c.Missing:0} plateb kartou",
        ConditionType.IncomingSum => $"{c.Missing:N0} příchozích plateb",
        _ => $"{c.Missing:N0} průměrného zůstatku",
    };

    public async Task<List<NotificationDto>> ListAsync() =>
        (await db.Notifications.AsNoTracking().Where(n => n.DismissedAt == null).OrderByDescending(n => n.Severity).ThenByDescending(n => n.CreatedAt).ToListAsync())
        .Select(n => new NotificationDto(n.Id, n.Type, n.Severity, n.Title, n.Text, n.AccountId, n.RecurringPaymentId, n.CreatedAt)).ToList();

    public async Task DismissAsync(int id)
    {
        var n = await db.Notifications.FindAsync(id) ?? throw new DomainException("Upozornění neexistuje.");
        n.DismissedAt = time.GetUtcNow();
        await db.SaveChangesAsync();
    }

    public async Task<Badges> BadgesAsync() => new(
        await inbox.CountAsync(),
        await db.ImportBatches.CountAsync(b => b.State != BatchState.Confirmed),
        (await recurring.AlertsAsync()).Count(a => a.Kind == "missing") + await db.RecurringPayments.CountAsync(r => r.Status == RecurringStatus.Suggested),
        await db.Notifications.CountAsync(n => n.DismissedAt == null));
}

/// <summary>Export pohybů do CSV (středník, UTF-8 s BOM – otevře se rovnou v Excelu).</summary>
public class ExportService(AppDbContext db)
{
    public async Task<byte[]> TransactionsCsvAsync(DateRange range)
    {
        var paths = await CategoryService.PathsAsync(db);
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id, a => a.Name);
        var members = await db.Members.AsNoTracking().ToDictionaryAsync(m => m.Id, m => m.Name);
        var txs = await db.Transactions.AsNoTracking().Include(t => t.Splits).Include(t => t.Shares)
            .Where(t => t.Date >= range.From && t.Date <= range.To).OrderBy(t => t.Date).ThenBy(t => t.Id).ToListAsync();
        var sb = new StringBuilder();
        sb.AppendLine("Datum;Účet;Protistrana;Zpráva;Částka;Měna;Částka Kč;Typ;Kategorie;Členové;Stav;Nezapočítávat;Poznámka");
        var cz = CultureInfo.GetCultureInfo("cs-CZ");
        static string Q(string? s) => s is null ? "" : s.Contains(';') || s.Contains('"') || s.Contains('\n') ? $"\"{s.Replace("\"", "\"\"")}\"" : s;
        foreach (var t in txs)
        {
            var cat = t.IsSplit ? string.Join(" + ", t.Splits.Select(s => $"{paths.GetValueOrDefault(s.CategoryId)} {s.Amount.ToString("0.##", cz)}"))
                : t.CategoryId is { } c ? paths.GetValueOrDefault(c) : "";
            var shares = string.Join(", ", t.Shares.Select(s => $"{members.GetValueOrDefault(s.MemberId)} {s.Percent:0.#} %"));
            sb.AppendLine(string.Join(';', t.Date.ToString("d. M. yyyy", cz), Q(accounts.GetValueOrDefault(t.AccountId)), Q(t.Counterparty), Q(t.Message),
                t.Amount.ToString("0.00", cz), t.Currency, t.AmountCzk.ToString("0.00", cz), t.Kind, Q(cat), Q(shares),
                t.Status == TransactionStatus.Confirmed ? "potvrzeno" : "nepotvrzeno", t.ExcludeFromStats ? "ano" : "", Q(t.Note)));
        }
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(sb.ToString())];
    }
}

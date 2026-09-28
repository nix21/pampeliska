using System.Globalization;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace Pampeliska.Core.Integrations;

public record CnbRate(DateOnly Date, string Currency, decimal Rate, DateOnly PublishedFor);

/// <summary>Kurzy devizového trhu ČNB (denní kurz platný k datu). Výsledky se cachují v DB.</summary>
public class CnbRates(HttpClient http, AppDbContext db)
{
    public const string BaseUrl = "https://www.cnb.cz/";

    public static Dictionary<string, decimal> Parse(string text, out DateOnly publishedFor)
    {
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        publishedFor = DateOnly.ParseExact(lines[0].Split(' ')[0], "dd.MM.yyyy", CultureInfo.InvariantCulture);
        var result = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(2))
        {
            var p = line.Split('|');
            if (p.Length < 5) continue;
            var amount = decimal.Parse(p[2], CultureInfo.InvariantCulture);
            var rate = decimal.Parse(p[4].Replace(',', '.'), CultureInfo.InvariantCulture);
            result[p[3]] = rate / amount;
        }
        return result;
    }

    public async Task<CnbRate> GetAsync(string currency, DateOnly date, CancellationToken ct = default)
    {
        currency = currency.ToUpperInvariant();
        if (currency == "CZK") return new CnbRate(date, currency, 1, date);

        var cached = await db.ExchangeRates.AsNoTracking().FirstOrDefaultAsync(r => r.Date == date && r.Currency == currency, ct);
        if (cached != null) return new CnbRate(date, currency, cached.Rate, date);

        var url = $"cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date={date:dd.MM.yyyy}";
        var text = await http.GetStringAsync(url, ct);
        var rates = Parse(text, out var published);
        if (!rates.TryGetValue(currency, out var rate))
            throw new InvalidOperationException($"ČNB nevyhlašuje kurz měny {currency}.");

        // Uložit všechny měny pro daný den
        foreach (var (cur, r) in rates)
            if (!await db.ExchangeRates.AnyAsync(x => x.Date == date && x.Currency == cur, ct))
                db.ExchangeRates.Add(new ExchangeRate { Date = date, Currency = cur, Rate = r });
        await db.SaveChangesAsync(ct);
        return new CnbRate(date, currency, rate, published);
    }
}

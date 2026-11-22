using System.Text;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;
using UglyToad.PdfPig.Exceptions;

namespace Pampeliska.Core.Integrations;

public enum PdfReadStatus { Ok, Locked, NoText, Invalid }

/// <param name="PasswordId">Které z předaných hesel PDF otevřelo (null = PDF nebylo zamčené).</param>
public record PdfReadResult(PdfReadStatus Status, string? Text = null, int? PasswordId = null, int Pages = 0);

/// <summary>Text z PDF výpisu (PdfPig), zamčené PDF zkusí otevřít uloženými hesly.</summary>
public static class PdfText
{
    public static PdfReadResult Read(byte[] pdf, IReadOnlyList<(int Id, string Password)> passwords)
    {
        var first = TryOpen(pdf, null);
        if (first.Status != PdfReadStatus.Locked) return first;
        foreach (var (id, password) in passwords)
        {
            var r = TryOpen(pdf, password);
            if (r.Status != PdfReadStatus.Locked) return r with { PasswordId = id };
        }
        return first;
    }

    private static PdfReadResult TryOpen(byte[] pdf, string? password)
    {
        try
        {
            using var doc = PdfDocument.Open(pdf, password is null ? new ParsingOptions() : new ParsingOptions { Password = password });
            var sb = new StringBuilder();
            foreach (var page in doc.GetPages())
            {
                var text = ContentOrderTextExtractor.GetText(page);
                if (string.IsNullOrWhiteSpace(text)) continue;
                sb.Append("--- strana ").Append(page.Number).Append(" ---\n").Append(text.Trim()).Append("\n\n");
            }
            return sb.Length == 0
                ? new PdfReadResult(PdfReadStatus.NoText, Pages: doc.NumberOfPages)
                : new PdfReadResult(PdfReadStatus.Ok, sb.ToString().TrimEnd(), Pages: doc.NumberOfPages);
        }
        catch (PdfDocumentEncryptedException)
        {
            return new PdfReadResult(PdfReadStatus.Locked);
        }
        catch (Exception e) when (e is PdfDocumentFormatException or InvalidOperationException or ArgumentException or IndexOutOfRangeException)
        {
            return new PdfReadResult(PdfReadStatus.Invalid);
        }
    }
}

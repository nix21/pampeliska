using Pampeliska.Core.Integrations;
using PdfSharp.Pdf.IO;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;
using Xunit;

namespace Pampeliska.Tests.Services;

public class PdfTextTests
{
    /// <summary>Jednoduché PDF s textem (řádky výpisu), volitelně zamčené heslem.</summary>
    public static byte[] Pdf(IEnumerable<string> lines, string? password = null, bool aes = true)
    {
        var builder = new PdfDocumentBuilder();
        var page = builder.AddPage(PageSize.A4);
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        var y = 800.0;
        foreach (var line in lines)
        {
            page.AddText(line, 10, new PdfPoint(40, y), font);
            y -= 14;
        }
        var bytes = builder.Build();
        if (password is null) return bytes;

        using var input = new MemoryStream(bytes);
        using var doc = PdfReader.Open(input, PdfDocumentOpenMode.Modify);
        if (aes) doc.SecurityHandler.SetEncryptionToV5();
        else doc.SecurityHandler.SetEncryptionToV2With128Bits();
        doc.SecuritySettings.UserPassword = password;
        doc.SecuritySettings.OwnerPassword = password + "-owner";
        using var output = new MemoryStream();
        doc.Save(output);
        return output.ToArray();
    }

    [Fact]
    public void Reads_unlocked_pdf()
    {
        var r = PdfText.Read(Pdf(["Vypis z uctu 123456789/2010", "01.11.2026 Albert -250,00"]), []);
        Assert.Equal(PdfReadStatus.Ok, r.Status);
        Assert.Contains("Albert", r.Text);
        Assert.Null(r.PasswordId);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Opens_locked_pdf_with_matching_password(bool aes)
    {
        var pdf = Pdf(["Vypis 11/2026", "Lidl -99,90"], "1234", aes);
        Assert.Equal(PdfReadStatus.Locked, PdfText.Read(pdf, []).Status);
        Assert.Equal(PdfReadStatus.Locked, PdfText.Read(pdf, [(1, "0000")]).Status);

        var r = PdfText.Read(pdf, [(1, "0000"), (2, "1234")]);
        Assert.Equal(PdfReadStatus.Ok, r.Status);
        Assert.Equal(2, r.PasswordId);
        Assert.Contains("Lidl", r.Text);
    }

    [Fact]
    public void Garbage_is_invalid()
    {
        Assert.Equal(PdfReadStatus.Invalid, PdfText.Read("tohle neni pdf"u8.ToArray(), []).Status);
    }
}

namespace Pampeliska.Core.Services;

/// <summary>Banka, jejíž podepsané e-maily (DKIM) se zpracují bez ručního povolení.</summary>
public record KnownBank(string Domain, string Name, string? InstitutionKey);

public static class KnownBanks
{
    public static readonly IReadOnlyList<KnownBank> All =
    [
        new("fio.cz", "Fio banka", "fio"),
        new("csas.cz", "Česká spořitelna", "cs"),
        new("rb.cz", "Raiffeisenbank", "rb"),
        new("airbank.cz", "Air Bank", "ab"),
        new("kb.cz", "Komerční banka", "kb"),
        new("csob.cz", "ČSOB", "csob"),
        new("mbank.cz", "mBank", "mb"),
        new("partnersbanka.cz", "Partners Banka", "pb"),
        new("revolut.com", "Revolut", "rev"),
        new("moneta.cz", "MONETA Money Bank", null),
        new("unicreditgroup.cz", "UniCredit Bank", null),
        new("creditas.cz", "Banka CREDITAS", null),
    ];

    /// <summary>Patří doména z podpisu (i subdoména, např. <c>mail.fio.cz</c>) k povolené doméně?</summary>
    public static bool DomainMatches(string signed, string allowed) =>
        signed.Equals(allowed, StringComparison.OrdinalIgnoreCase) || signed.EndsWith("." + allowed, StringComparison.OrdinalIgnoreCase);

    public static KnownBank? Find(string? domain) => domain is null ? null : All.FirstOrDefault(b => DomainMatches(domain, b.Domain));
}

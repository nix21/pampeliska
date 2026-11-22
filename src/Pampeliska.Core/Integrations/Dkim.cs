using DnsClient;
using MimeKit;
using MimeKit.Cryptography;

namespace Pampeliska.Core.Integrations;

/// <summary>Ověření podpisů DKIM: které domény e-mail opravdu podepsaly (podvržený „From“ podpis mít nebude).</summary>
public class DkimChecker(IDnsResolver dns)
{
    public async Task<IReadOnlyList<string>> PassingDomainsAsync(MimeMessage message, CancellationToken ct = default)
    {
        var verifier = new DkimVerifier(dns);
        var results = await verifier.VerifyAsync(message, ct);
        return results.Where(r => r.Status == DkimSignatureStatus.Pass && !string.IsNullOrEmpty(r.Domain))
            .Select(r => r.Domain!.ToLowerInvariant()).Distinct().ToList();
    }
}

/// <summary>TXT záznamy z DNS pro DKIM (veřejné klíče odesílatelů).</summary>
public class DnsClientResolver : IDnsResolver
{
    private readonly LookupClient _client = new(new LookupClientOptions { UseCache = true, Timeout = TimeSpan.FromSeconds(5), Retries = 2 });

    public DnsTxtResponse QueryTxt(string domain, CancellationToken cancellationToken = default) =>
        QueryTxtAsync(domain, cancellationToken).GetAwaiter().GetResult();

    public async Task<DnsTxtResponse> QueryTxtAsync(string domain, CancellationToken cancellationToken = default)
    {
        try
        {
            var r = await _client.QueryAsync(domain, QueryType.TXT, cancellationToken: cancellationToken);
            if (r.Header.ResponseCode == DnsHeaderResponseCode.NotExistentDomain) return new DnsTxtResponse(DnsQueryStatus.NonExistentDomain);
            if (r.HasError) return new DnsTxtResponse(DnsQueryStatus.TemporaryFailure);
            return new DnsTxtResponse(r.Answers.TxtRecords().Select(t => string.Concat(t.Text)));
        }
        catch (DnsResponseException)
        {
            return new DnsTxtResponse(DnsQueryStatus.TemporaryFailure);
        }
    }
}

using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Pampeliska.Api.OAuth;

public static partial class OAuthCrypto
{
    /// <summary>Náhodný token (256 bitů, base64url) s čitelným prefixem.</summary>
    public static string NewToken(string prefix) => prefix + Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    /// <summary>SHA-256 v hexu – do DB se ukládají jen hashe tokenů, kódů a tajemství.</summary>
    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    /// <summary>S256 code_challenge = base64url(SHA-256) bez paddingu = 43 znaků.</summary>
    public static bool IsValidChallenge(string? challenge) => challenge is not null && ChallengeRegex().IsMatch(challenge);

    /// <summary>PKCE S256 (RFC 7636 §4.6).</summary>
    public static bool VerifyPkce(string? verifier, string challenge)
    {
        if (verifier is null || !VerifierRegex().IsMatch(verifier)) return false;
        var computed = Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        return FixedTimeEquals(computed, challenge);
    }

    [GeneratedRegex(@"^[A-Za-z0-9\-._~]{43,128}$")]
    private static partial Regex VerifierRegex();

    [GeneratedRegex(@"^[A-Za-z0-9_-]{43}$")]
    private static partial Regex ChallengeRegex();
}

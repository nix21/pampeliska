using Pampeliska.Api.OAuth;

namespace Pampeliska.Tests.OAuth;

public class PkceTests
{
    // RFC 7636, Appendix B
    private const string Verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    private const string Challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    [Fact]
    public void Rfc7636_test_vector_verifies() => Assert.True(OAuthCrypto.VerifyPkce(Verifier, Challenge));

    [Theory]
    [InlineData("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXX")] // jiný verifier
    [InlineData("tooShort")]
    [InlineData("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk!")] // nepovolený znak
    [InlineData(null)]
    public void Invalid_verifier_fails(string? verifier) => Assert.False(OAuthCrypto.VerifyPkce(verifier, Challenge));

    [Theory]
    [InlineData(Challenge, true)]
    [InlineData("short", false)]
    [InlineData("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM=", false)]
    [InlineData(null, false)]
    public void Challenge_format(string? challenge, bool valid) => Assert.Equal(valid, OAuthCrypto.IsValidChallenge(challenge));

    [Fact]
    public void Tokens_are_random_and_prefixed()
    {
        var a = OAuthCrypto.NewToken("pmp_at_");
        Assert.StartsWith("pmp_at_", a);
        Assert.NotEqual(a, OAuthCrypto.NewToken("pmp_at_"));
        Assert.Equal(64, OAuthCrypto.Hash(a).Length);
    }
}

public class RedirectUriPolicyTests
{
    private readonly RedirectUriPolicy _policy = new(new McpOAuthOptions());

    [Theory]
    [InlineData("https://claude.ai/api/mcp/auth_callback")]
    [InlineData("https://claude.com/api/mcp/auth_callback")]
    [InlineData("http://localhost:1234/callback")]
    [InlineData("http://127.0.0.1:9/cb")]
    [InlineData("http://[::1]:5000/callback")]
    public void Allowed(string uri) => Assert.True(_policy.IsAllowed(uri));

    [Theory]
    [InlineData("https://evil.com/cb")]
    [InlineData("http://localhost.evil.com/callback")]
    [InlineData("https://localhost/callback")]
    [InlineData("https://claude.ai/other")]
    [InlineData("https://claude.ai/api/mcp/auth_callback#x")]
    [InlineData("http://user:pw@localhost:1234/callback")]
    [InlineData("javascript:alert(1)")]
    [InlineData("/relative")]
    [InlineData("")]
    public void Rejected(string uri) => Assert.False(_policy.IsAllowed(uri));

    [Fact]
    public void Loopback_disabled_by_config() =>
        Assert.False(new RedirectUriPolicy(new McpOAuthOptions { AllowLoopbackRedirects = false }).IsAllowed("http://localhost:1234/callback"));

    [Theory]
    [InlineData("http://localhost:1111/callback", "http://localhost:2222/callback", true)]
    [InlineData("http://localhost:1111/callback", "http://localhost:2222/other", false)]
    [InlineData("http://localhost:1111/callback", "http://127.0.0.1:1111/callback", false)]
    [InlineData("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback", true)]
    [InlineData("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback/", false)]
    public void Matching(string registered, string requested, bool expected) =>
        Assert.Equal(expected, RedirectUriPolicy.Matches(registered, requested));

    [Theory]
    [InlineData("http://localhost/mcp", "http://localhost/mcp/", true)]
    [InlineData("HTTP://LOCALHOST/mcp", "http://localhost/mcp", true)]
    [InlineData("http://localhost/mcp", "http://localhost/other", false)]
    [InlineData("https://faktury.nadrasky.cz/mcp", "https://evil.cz/mcp", false)]
    public void Resource_comparison(string a, string b, bool expected) => Assert.Equal(expected, OAuthService.SameResource(a, b));
}

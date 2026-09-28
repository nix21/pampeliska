using System.Text;
using System.Text.Encodings.Web;

namespace Pampeliska.Api.OAuth;

/// <summary>Souhlasová a chybová stránka OAuth – čisté HTML ze serveru, bez SPA a bez skriptů.</summary>
public static class ConsentPage
{
    private static string E(string? s) => HtmlEncoder.Default.Encode(s ?? "");

    public static IResult Consent(AuthorizeRequest req, string clientName, string userEmail, bool wantsWrite,
        string antiforgeryFieldName, string antiforgeryToken)
    {
        var host = RedirectUriPolicy.DisplayHost(req.RedirectUri!);
        var hidden = new StringBuilder();
        foreach (var (name, value) in req.Fields())
            hidden.Append($"""<input type="hidden" name="{E(name)}" value="{E(value)}">""");
        hidden.Append($"""<input type="hidden" name="{E(antiforgeryFieldName)}" value="{E(antiforgeryToken)}">""");
        var check = wantsWrite ? " checked" : "";

        var body = $"""
            <h1>Připojit aplikaci k Pampelišce?</h1>
            <p class="app"><strong>{E(clientName)}</strong><br><span class="muted">název uvádí sama aplikace</span></p>
            <p>Po povolení bude přesměrováno na <strong class="host">{E(host)}</strong>.
               Pokud to neodpovídá aplikaci, kterou právě připojujete (Claude Desktop → <em>claude.ai</em>,
               Claude Code → <em>localhost</em>), připojení zamítněte.</p>
            <p>Aplikace bude jménem <strong>{E(userEmail)}</strong> moci <strong>číst</strong> účty, pohyby, kategorie,
               pravidla, rozpočty a souhrny celé domácnosti.</p>
            <form method="post" action="/oauth/authorize">
              {hidden}
              <label class="write"><input type="checkbox" name="write"{check}>
                <span><strong>Povolit i zápis</strong><br>
                <span class="muted">import pohybů, kategorizace, zakládání a mazání kategorií a pravidel, pravidelné platby,
                rozpočty, investice a úpravy účtů. Mazat účty a pohyby ani měnit nastavení nejde.</span></span>
              </label>
              <p class="muted">Připojení lze kdykoli zrušit v Nastavení → Připojení klienti.</p>
              <div class="buttons">
                <button type="submit" name="decision" value="deny" class="secondary">Zamítnout</button>
                <button type="submit" name="decision" value="allow">Povolit</button>
              </div>
            </form>
            """;
        return Page("Připojení AI – Pampeliška", body, 200);
    }

    public static IResult Error(string message, int status = 400) =>
        Page("Chyba připojení – Pampeliška", $"""
            <h1>Připojení nelze dokončit</h1>
            <p>{E(message)}</p>
            <p class="muted">Zkuste konektor v Claude odebrat a přidat znovu. Návod je v Pampelišce v Nastavení → Připojení klienti.</p>
            """, status);

    private static IResult Page(string title, string body, int status) => new HtmlResult($$"""
        <!doctype html>
        <html lang="cs">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex">
        <title>{{E(title)}}</title>
        <style>
          :root { color-scheme: light dark; --fg:#1D1B16; --muted:#5F5A4E; --bg:#F6F4EE; --card:#fff; --accent:#F2B705; --border:#E7E2D6; }
          @media (prefers-color-scheme: dark) { :root { --fg:#F3EFE4; --muted:#B5AE9C; --bg:#13120E; --card:#1D1B16; --accent:#FFC928; --border:#302D25; } }
          body { margin:0; font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--bg); color:var(--fg); }
          main { max-width:520px; margin:48px auto; padding:28px 32px; background:var(--card); border:1px solid var(--border); border-radius:12px; }
          @media (max-width:560px) { main { margin:16px; padding:20px; } }
          h1 { font-size:1.35rem; margin:0 0 16px; }
          .muted { color:var(--muted); font-size:.9rem; }
          .app { font-size:1.1rem; }
          .host { text-decoration:underline; text-decoration-color:var(--accent); text-decoration-thickness:2px; }
          ul { padding-left:1.2rem; }
          .write { display:flex; gap:10px; align-items:flex-start; padding:12px; border:1px solid var(--border); border-radius:10px; }
          .write input { margin-top:5px; }
          .buttons { display:flex; gap:12px; justify-content:flex-end; margin-top:24px; }
          button { font:inherit; padding:8px 20px; border-radius:8px; border:1px solid var(--accent); background:var(--accent); color:#1D1B16; font-weight:700; cursor:pointer; }
          button.secondary { background:transparent; color:var(--fg); border-color:var(--border); }
        </style>
        </head>
        <body><main>{{body}}</main></body>
        </html>
        """, status);

    private sealed class HtmlResult(string html, int status) : IResult
    {
        public Task ExecuteAsync(HttpContext ctx)
        {
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "text/html; charset=utf-8";
            var h = ctx.Response.Headers;
            h.CacheControl = "no-store";
            h["Referrer-Policy"] = "no-referrer";
            // Bez form-action: Chrome ho uplatňuje i na přesměrování po odeslání formuláře (na claude.ai / localhost)
            h.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";
            return ctx.Response.WriteAsync(html);
        }
    }
}

# MCP server Pampelišky

Na adrese `https://pampeliska.nadrasky.cz/mcp` běží vzdálený MCP server (Streamable HTTP, bezstavový). Claude přes něj
nahrává pohyby z výpisů, kategorizuje je, spravuje kategorie a pravidla a čte celý datový model domácnosti.

## Přihlášení (OAuth 2.1)

Aplikace je sama autorizačním serverem (kopie řešení z Invoiceru): metadata RFC 8414 / 9728, dynamická registrace
klientů (RFC 7591), PKCE S256, audience `…/mcp` (RFC 8707), rotace refresh tokenů, revokace (RFC 7009).
Uživatel se přihlašuje Googlem; přístup má jen člen domácnosti.

Scope:

| Scope | Co dovolí |
|---|---|
| `pampeliska.read` | čtecí nástroje |
| `pampeliska.write` | navíc zápisové nástroje (import, kategorizace, kategorie, pravidla, pravidelné platby, rozpočty, investice, účty) |

Scope se volí na souhlasové stránce zaškrtávátkem „Povolit i zápis“. Přes MCP nejde mazat účty ani pohyby a měnit
nastavení domácnosti. Připojení jsou vidět a jdou odebrat v Nastavení → Import a MCP.

## Připojení

- **Claude Desktop / claude.ai:** Settings → Connectors → Add custom connector → URL `https://pampeliska.nadrasky.cz/mcp`.
- **Claude Code:** `claude mcp add --transport http --scope user pampeliska https://pampeliska.nadrasky.cz/mcp`, pak `/mcp` → Authenticate.

## Lokální vývoj

```bash
claude mcp add --transport http pampeliska-dev http://localhost:5290/mcp
npx @modelcontextprotocol/inspector
```

Přes Vite (`http://localhost:5174/mcp`) to funguje také – proxy zachovává Host, takže issuer odpovídá adrese.

## Nástroje

Aktuální seznam vrací `tools/list`; popisy nástrojů a parametrů jsou česky. Postup práce popisují instrukce serveru
(`src/Pampeliska.Api/Mcp/McpSetup.cs`).

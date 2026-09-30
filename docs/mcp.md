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

Popisy nástrojů a parametrů jsou česky. Postup práce popisují instrukce serveru (`src/Pampeliska.Api/Mcp/McpSetup.cs`).

| Oblast | Čtení (`pampeliska.read`) | Zápis (`pampeliska.write`) |
|---|---|---|
| Domácnost a účty | `get_household`, `list_accounts`, `get_account`, `list_institutions` | `create_account`, `update_account`, `add_balance_correction` |
| Import a fronta | `get_categorization_queue`, `list_batches`, `get_batch`, `get_transactions`, `get_transaction` | `import_transactions`, `suggest_categories`, `categorize_transactions`, `confirm_transactions`, `resolve_duplicate`, `link_transfer`, `unlink_transfer`, `finish_batch_categorization` |
| Kategorie | `list_categories` | `create_category`, `update_category`, `merge_category`, `delete_category` |
| Pravidla | `list_rules`, `test_rule`, `get_rule_suggestions` | `create_rule`, `update_rule`, `move_rule`, `delete_rule`, `apply_rule_to_history` |
| Poznámky ke kategorizaci | `list_notes` | `add_note`, `update_note`, `delete_note` |
| Souhrny | `get_summary`, `get_spending_by_month` | – |
| Plánování | `list_recurring_payments`, `get_balance_forecast`, `get_conditions_status`, `get_budgets` | `create_recurring_payment`, `update_recurring_payment`, `confirm_recurring_suggestion`, `end_recurring_payment`, `pair_recurring_occurrence`, `set_budget` |
| Majetek | `get_net_worth`, `get_investments` | `add_investment_value`, `add_investment_trade` |

Typický tok importu: `list_accounts` → `import_transactions` (duplicity a převody řeší server) → `list_notes` → `get_categorization_queue`
→ `suggest_categories` (s jistotou; nad prahem domácnosti se potvrdí samo) → návrh pravidel `create_rule` → `add_note`.

**Poznámky ke kategorizaci** jsou sdílená paměť AI nezávislá na klientovi a členovi (tabulka `categorization_notes`, max 300 poznámek
po 1000 znacích). Patří do nich zvyklosti a výjimky, které nejde vyjádřit pravidlem („platby od Jany K. jsou kapesné“). Poznámka může
být navázaná na obchodníka (text, který obsahuje) a/nebo kategorii. Navázané poznámky se připojují k položkám `get_categorization_queue`
(pole `notes`): podle obchodníka, nebo když je navržená kategorie (či její předek) kategorií poznámky. AI je ukládá bez ptaní, ale
uživateli ohlásí, co si zapamatovala. V aplikaci je vidí a upravuje v Pravidla → Poznámky pro AI.

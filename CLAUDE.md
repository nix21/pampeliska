# Pampeliška – poznámky pro vývoj

Česká aplikace na rodinné finance. Veškeré UI texty, chybové hlášky (`DomainException`) a komentáře česky.

## Struktura

- `src/Pampeliska.Core` – doména (`Domain/`), EF Core (`Data/AppDbContext.cs`, migrace, `Seed.cs`), služby (`Services/`).
  Služby jsou scoped, registrované v `CoreServices.cs`. Čisté výpočty jsou statické (RuleEngine, RecurringSchedule…) kvůli testům.
- `src/Pampeliska.Api` – minimal API (`Endpoints/*.cs`, `MapXxxEndpoints(this RouteGroupBuilder api)` zapojené v `Endpoints.cs`),
  `Auth.cs` + `MemberDirectory` (allowlist = e-maily členů), `OAuth/` (autorizační server pro MCP), `Mcp/` (nástroje).
- `tests/Pampeliska.Tests` – xUnit, InMemory DB. `PampeliskaFactory` v `Mcp/McpFlowTests.cs` = celé API.
- `web/` – React SPA. Build jde do `src/Pampeliska.Api/wwwroot`.

## Backend konvence

- Jen přenositelné EF dotazy (testy běží nad InMemory): žádné `ExecuteUpdate`, raw SQL ani Npgsql specifika.
- Chyby pro uživatele = `throw new DomainException("…")` → API 400 `{ error }`, MCP chyba nástroje (`McpSetup.Guard`).
- „Dnes“ vždy přes `TimeProvider.Today()` (Europe/Prague), nikdy `DateTime.Now`.
- Enumy se serializují jako řetězce (API i MCP).
- Nová služba → `CoreServices.AddPampeliskaCore`. Změna modelu → `dotnet ef migrations add <Název> --project src/Pampeliska.Core --startup-project src/Pampeliska.Api --output-dir Data/Migrations`.
- MCP nástroje: `[McpServerToolType]` třída s DI v primárním konstruktoru, `[McpServerTool(Name = "snake_case", Title = "…", ReadOnly = …)]`,
  `[Description]` česky na metodě i parametrech, tělo v `McpSetup.Guard(...)`. Zápisové nástroje (`ReadOnly = false`) vyžadují scope
  `pampeliska.write` (filtr v `McpSetup`). Nástroj volá stejné služby jako HTTP API.

## Frontend konvence

- Design = prototyp z claude.ai/design (styl „Sluneční“): tokeny v `web/src/styles/tokens.css`, jen `var(--*)`, žádné pevné barvy
  (výjimka: barvy bank z API). Font Manrope. Tmavý režim přes `:root[data-mode="dark"]`.
- UI kit v `web/src/components/ui` (Radix primitives + `ui.module.css`): Button, IconButton, Segmented, Switch, Checkbox, RadioCards,
  Select, Field/TextInput/NumberInput/DateInput, Dialog, Popover, DropdownMenu, Tooltip, toast, Card/CardHeader, Pill, Avatar,
  Callout, ProgressBar, Empty, Spinner. Nové komponenty stylovat přes `*.module.css`.
- Sdílené: `components/common.tsx` (Money, MemberSwitch, PeriodPicker, ConfirmedToggle, InstitutionBadge, Dot, Sparkline),
  `components/AppShell.tsx` (navigace, `PageHeader`, `ENABLED` = obrazovky v menu).
- Globální stav `state/ui.tsx` (`useUi()`): člen, období, porovnání, jen potvrzené, skrytí částek, režim. `filterParams` jde do API.
- Data přes TanStack Query + `lib/api.ts` (`api.get/post/put/del`, `notifyError`, `qs`). Typy DTO ručně v `lib/types.ts`.
- Formátování v `lib/format.ts`: `money()` (typografické minus, ` Kč`), `count()` (české plurály), data „28. 9.“.
- Mobil: breakpoint 767 px, dotykové cíle ≥ 44 px, detaily jako samostatné stránky / spodní sheet.

## Ověření

```bash
dotnet test tests/Pampeliska.Tests
cd web && npx tsc -b && npx oxlint
```

Lokálně: Postgres na portu 55433 (viz README), `.claude/launch.json` spouští `api` (5290) a `web` (5174).

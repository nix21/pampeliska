# 02 – Model tenantů

Stav: neotevřeno · Závisí na: 01

## Cíl

Rozhodnout, jak se v jedné instalaci oddělí data jednotlivých domácností.

## Dnešní stav

- `Household` je podle komentáře v doméně „instance aplikace má právě jednu“.
- Žádná doménová tabulka nemá `HouseholdId` (v `AppDbContext` je 34 `DbSet`), dotazy domácnost neřeší.
- Členové (`Member`) jsou zároveň allowlist přihlášení (`MemberDirectory`).
- OAuth tabulky pro MCP (klienti, granty, tokeny) jsou globální.
- Testy běží nad InMemory DB, takže řešení musí fungovat i tam (viz konvence v `CLAUDE.md`).

## Otázky

### Q1 – Způsob izolace
- Varianty:
  - sdílená DB a schéma, `HouseholdId` ve všech tabulkách + globální query filtr v EF,
  - schéma na domácnost (Postgres schema),
  - databáze na domácnost.
- Doporučení: —
- **Rozhodnutí:** —

### Q2 – Kde se tenant určuje
- Varianty: z přihlášeného uživatele (claim) · subdoména · cesta v URL.
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Může být jeden uživatel ve více domácnostech?
- Varianty: ne (1 uživatel = 1 domácnost) · ano, s přepínačem domácnosti.
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – Uživatel vs. člen domácnosti
- Dnes splývá člen a přihlašovací identita. Oddělit `User` (identita) od `Member` (role v domácnosti)?
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – Globální vs. tenantová data
- K rozdělení: instituce/banky, kurzy ČNB, výchozí kategorie, OAuth klienti MCP.
- Doporučení: —
- **Rozhodnutí:** —

### Q6 – Převod dnešní instance
- Tvoje domácnost jako tenant č. 1 – migrace dat, výpadek, ověření.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

—

## Dopad na implementaci

—

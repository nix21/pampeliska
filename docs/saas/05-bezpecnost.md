# 05 – Bezpečnost

Stav: neotevřeno · Závisí na: 02, 04

## Cíl

Úroveň zabezpečení odpovídající cizím finančním datům.

## Dnešní stav

- Jedna domácnost, takže izolaci mezi tenanty dnes nic neřeší.
- Cookie `HttpOnly`, `SameSite=Lax`; MCP přes Bearer tokeny vlastního OAuth serveru.
- Zálohy šifrované (kontejner převzatý z Invoiceru), viz `docs/vps-setup.md`.

## Otázky

### Q1 – Záruka izolace tenantů
- Varianty: globální query filtr + testy na únik dat · navíc Postgres Row-Level Security.
- Doporučení: —
- **Rozhodnutí:** —

### Q2 – Šifrování
- Varianty: jen disk/zálohy · citlivá pole (čísla účtů, poznámky) na úrovni aplikace · klíč na domácnost.
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Audit log
- Co logovat (přihlášení, změny členů, exporty, přístup provozovatele) a jak dlouho držet.
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – Ochrana proti zneužití
- Rate limiting (API, MCP, přihlášení, import), limity velikosti, ochrana registrace.
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – Bezpečnostní hlavičky a ověření
- CSP, HSTS, závislosti (Dependabot), externí penetrační test před fází 2?
- Doporučení: —
- **Rozhodnutí:** —

### Q6 – Incidenty
- Postup při úniku dat, kontakt na hlášení zranitelností.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

—

## Dopad na implementaci

—

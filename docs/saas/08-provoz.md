# 08 – Provoz

Stav: neotevřeno · Závisí na: 02

## Cíl

Spolehlivý provoz pro cizí uživatele: nasazování, zálohy, monitoring, e-maily.

## Dnešní stav

- Jeden VPS, docker compose (Postgres 17 + aplikace), veřejný provoz přes sdílený Caddy s Invoicerem
  (`deploy/`, `docs/vps-setup.md`).
- Nasazení přes self-hosted GitHub runner.
- Šifrované zálohy celé DB, obnova `restore.sh` (celá DB).
- Upozornění jen v aplikaci, žádné e-maily.

## Otázky

### Q1 – Hosting
- Varianty: dál sdílený VPS · vlastní VPS pro Pampelišku · managed Postgres; umístění v EU.
- Doporučení: —
- **Rozhodnutí:** —

### Q2 – Zálohy a obnova
- Četnost, retence, obnova jedné domácnosti (ne celé DB), pravidelný test obnovy.
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Nasazování
- Migrace bez výpadku nebo ohlášená údržba, staging prostředí, rollback.
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – Monitoring a logy
- Dostupnost, chyby (např. Sentry), metriky, upozornění na tebe; co z logů nesmí obsahovat data uživatelů.
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – Transakční e-maily
- Pozvánky, upozornění, platby; poskytovatel e-mailů, doména a SPF/DKIM.
- Šablony ve všech jazycích aplikace (01/Q2).
- Doporučení: —
- **Rozhodnutí:** —

### Q6 – Kapacita
- Odhad počtu domácností a dat ve fázi 1 a 2, kdy škálovat.
- Z toho výše stropu registrací v betě (01/Q5) – kolik domácností služba unese bez degradace.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

—

## Dopad na implementaci

—

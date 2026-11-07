# Pampeliška pro více domácností – rozmýšlení

Cíl: zpřístupnit Pampelišku jako veřejnou aplikaci pro libovolné domácnosti.

- **Fáze 1** – otevřená beta (cílově 50+ domácností) s volnou registrací do stropu, pak waitlist
  (původně „jen na pozvánku“, změněno v 01/Q5).
- **Fáze 2** – předplatné, první dva měsíce zdarma.
- Start v ČR (napojení na banky přes Finbricks), další země EU až s objemem – viz 01/Q6. i18n se staví
  hned, beta česky a anglicky (01/Q2).

Tahle složka zatím není implementační plán. Sbírají se tu rozhodnutí po oblastech; plán (`plan.md`) vznikne,
až budou všechny oblasti rozhodnuté.

## Postup

1. Oblasti se probírají postupně podle pořadí v tabulce (pozdější závisí na dřívějších).
2. U každé otázky se zapíšou varianty, doporučení a **rozhodnutí s datem a důvodem**.
3. Co nejde rozhodnout bez vnějšího zdroje (právník, účetní, poskytovatel plateb), jde do „Otevřené / zjistit venku“.
4. Postřehy pro pozdější implementaci jdou do „Dopad na implementaci“ – zatím bez plánování.
5. Po změně oblasti aktualizovat stav v tabulce níže.

Stavy: **neotevřeno** · **rozpracováno** · **rozhodnuto**

## Mapa oblastí

| # | Oblast | Stav | Závisí na |
|---|---|---|---|
| 01 | [Produkt a rozsah](01-produkt.md) | rozpracováno (Q1 čeká na 03/Q0) | – |
| 02 | [Model tenantů](02-tenanti.md) | neotevřeno | 01 |
| 03 | [Import dat a AI](03-import-a-ai.md) | neotevřeno | 01 |
| 04 | [Identita a přístup](04-identita.md) | neotevřeno | 02 |
| 05 | [Bezpečnost](05-bezpecnost.md) | neotevřeno | 02, 04 |
| 06 | [Právo a GDPR](06-pravo-gdpr.md) | neotevřeno | 03, 05 |
| 07 | [Předplatné a platby](07-predplatne.md) | neotevřeno | 01, 03 |
| 08 | [Provoz](08-provoz.md) | neotevřeno | 02 |
| 09 | [Administrace a podpora](09-administrace.md) | neotevřeno | 04, 07 |
| 10 | [Značka a veřejný web](10-znacka-web.md) | neotevřeno | 01 |
| 11 | [Onboarding](11-onboarding.md) | neotevřeno | 03 |

## Rešerše

- [Konkurence: rodinné funkce](research/konkurence-rodinne-funkce.md) (2026-10-31)
- [Agregátoři bankovních dat pro ČR a EU](research/agregatory-cr.md) (2026-10-31)
- [Odhad nákladů na AI na domácnost](research/naklady-ai.md) (2026-10-31)
- [Ekonomika napojení na banky](research/ekonomika-napojeni.md) (2026-11-03)
- [Kolik stojí 200 platících domácností](research/marketing-200.md) (2026-11-03)
- [Návratnost s nabídkou Finbricks](research/navratnost-finbricks.md) (2026-11-06)
- [Klíčová slova pro reklamu ve vyhledávání](research/klicova-slova.md) (2026-11-07)

## Poptávky

- [Agregátoři bankovních dat](poptavka-agregatori.md): Finbricks, finAPI, Tink, Salt Edge, doplněk pro Enable
  Banking (2026-10-31)

## Šablona oblasti

```markdown
# NN – Název

Stav: neotevřeno · Závisí na: …

## Cíl
## Dnešní stav
## Otázky
### Qn – otázka
- Varianty: …
- Doporučení: …
- **Rozhodnutí:** — (datum, důvod)
## Otevřené / zjistit venku
## Dopad na implementaci
```

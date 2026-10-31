# 03 – Import dat a AI

Stav: neotevřeno · Závisí na: 01

## Cíl

Rozhodnout, jak dostane cizí uživatel data do Pampelišky a kdo za to zaplatí (hlavně AI).

## Dnešní stav

- Výpisy importuje a kategorizuje AI klient uživatele přes MCP (`import_transactions`, `suggest_categories`…);
  parsování výpisu dělá sám AI klient.
- Web import ze souboru nemá (jen ruční pohyb a export CSV).
- Server nevolá žádnou AI; jediná vnější integrace jsou kurzy ČNB.
- Pravidla (`RuleEngine`), deduplikace a fronta Ke kategorizaci jsou na serveru.

## Otázky

### Q0 – Kolik stojí AI na domácnost (vstup pro 01/Q1)
- Spočítat: rozkategorizování výpisu typické domácnosti (počet pohybů za měsíc, tokeny na pohyb, s pravidly
  a bez nich), parsování výpisu z PDF/CSV.
- Porovnat modely: stačí levný model, nebo je potřeba silnější? Kvalita kategorizace na vzorku vlastních dat.
- Chat s AI o zpracování výpisů (doptávání, opravy, poznámky) – kolik přidá k nákladům.
- Výstup: odhad Kč/domácnost/měsíc pro varianty; podle něj se rozhodne 01/Q1 a ceník v 07.
- **Rozhodnutí:** —

### Q1 – Cesta importu pro uživatele bez AI klienta
- Varianty: CSV/PDF parsery jednotlivých bank na serveru · vestavěná AI, která parsuje · jen MCP („přines si AI“).
- Doporučení: —
- **Rozhodnutí:** —

### Q2 – Napojení na banky (PSD2)
- Varianty: ne · přes agregátora (licencovaný poskytovatel) · vlastní licence AISP (nereálné).
- Zjištění (2026-10-31): ruční stahování výpisů je hlavní bariéra (vlastník: 9 účtů u 4 bank každý měsíc),
  konkurence napojení na banky má → **napojení je základ produktu, ne fáze 2**. Rešerše:
  [research/agregatory-cr.md](research/agregatory-cr.md).
  - Enable Banking českým uživatelům službu neposkytuje (jen TPP s vlastní licencí) – bez licence nepoužitelný.
  - Plaid ČR nepokrývá; GoCardless nové zákazníky nebere.
  - Užší výběr k poptávce: Finbricks (KB, AISP je banka), finAPI (veřejný ceník vč. licence, ≈ 260 €/měs.
    do 200 uživatelů – ověřeno), Tink (9 CZ bank), Salt Edge Partner Program.
  - PSD2: obnova SCA nejpozději po 180 dnech, bez uživatele max. 4× denně, delší historie jen hned po SCA.
- Doporučení: poptat užší výběr (otázky v rešerši, kap. 6), rozhodnout podle pokrytí bank a ceny.
- **Rozhodnutí:** —

### Q3 – Vestavěná AI na serveru
- Varianty: žádná · jen kategorizace · parsování i kategorizace · chat nad daty.
- Kdo platí: v ceně předplatného s limity · vlastní API klíč uživatele.
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – MCP ve veřejné verzi
- Varianty: pro všechny · jen vyšší tarif · jen beta.
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – Limity a náklady
- Pohyby/měsíc, velikost importu, počet volání AI na domácnost.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

- Aktuální agregátoři bankovních dat pro cílové země a jejich ceny (trh je evropský, viz 01/Q2).
- Formáty výpisů bank v cílových zemích (CSV, CAMT.053, PDF) – parsery pro každou banku zvlášť se neškálují.
- Odhad nákladů AI na jednu domácnost za měsíc.

## Dopad na implementaci

—

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
- **Odhad (2026-10-31):** [research/naklady-ai.md](research/naklady-ai.md). Vlastní domácnost (353 pohybů/měs.):
  39 % převodů a 32 % pravidel jde bez AI, AI řeší ≈ 100 pohybů/měs. Kategorizace a běžný chat za měsíc:
  **Haiku 5.5 ≈ 1 Kč, Sonnet 5.5 ≈ 13 Kč, Opus 5.5 ≈ 26 Kč**, jednorázově při připojení ≈ 1 / 20 / 40 Kč.
  To je méně než napojení na banky (finAPI ≈ 32 Kč na uživatele). Největší neznámá je intenzivní chat,
  proto je potřeba limit (Q5). Kvalitu levného modelu zatím nikdo neměřil.
- Doporučení: změřit přesnost Haiku 5.5 a Sonnet 5.5 na potvrzených pohybech vlastní domácnosti
  (jednotky dolarů) a pak zvolit model.
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
- Trh: původně rovnou EU, od 2026-11-06 start v ČR (01/Q6). Další země přibudou s druhým agregátorem.
- Odpovědi (11/2026): Enable Banking 900 €/měs. + 0,5 € za účet, Salt Edge od 1 000 €/měs., Finbricks
  bez ceny. Výpočet: [research/ekonomika-napojeni.md](research/ekonomika-napojeni.md). Enable Banking a Salt
  Edge se zaplatí až při ≈ 200–600 platících domácnostech a s cenou 6–8 €/měs. Beta zdarma by s nimi stála
  ≈ 12 tis. €/rok. finAPI podle veřejného ceníku ≈ 3,4 tis. €/rok, bod zvratu ≈ 70–150 domácností.
- Druhé kolo (11/2026): ostatní ≈ 500 €/měs. Finbricks nabídl startovací balíček 10 000 Kč/měs. do
  100 tis. volání (≈ 333 domácností při 2 voláních denně na účet), nad tím 30 000 Kč, vstup 25 000 Kč.
  Bod zvratu ≈ 95 platících (ceník 199 / 149 Kč, s.r.o. neplátce DPH), viz
  [research/navratnost-finbricks.md](research/navratnost-finbricks.md). Finbricks pokrývá jen CEE, proto se
  start zúžil na ČR (01/Q6).
- Doporučení: poptat užší výběr, rozhodnout podle pokrytí bank a ceny. Napojení stavět přes vlastní rozhraní
  nezávislé na agregátorovi, aby šlo začít levným a přejít později. Texty poptávky a tabulka na odpovědi:
  [poptavka-agregatori.md](poptavka-agregatori.md).
- **Rozhodnutí:** (2026-11-06) **Finbricks pro start v ČR**, podmíněně. Před podpisem si od nich nechat
  potvrdit: co je jedno volání, kolik volání pokryje 30 000 Kč, jak dlouho platí startovací cena a s jakou
  výpovědní lhůtou, jak to je s ČSOB, UniCredit a Slovenskem, a jestli jde vstupní poplatek zaplatit až před
  ostrým spuštěním. Napojení stavět přes vlastní rozhraní nezávislé na agregátorovi.

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

- Odpovědi Finbricks na otázky před podpisem (viz Q2).
- Formáty výpisů českých bank, které Finbricks nepokryje (ČSOB, UniCredit?): import souborů jako záloha.
- Odhad nákladů AI na domácnost: hotový, viz Q0.

## Dopad na implementaci

—

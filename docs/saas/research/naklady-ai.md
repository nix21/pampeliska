# Odhad nákladů na AI na domácnost

Stav k 31. 10. 2026 · Podklad pro [03/Q0](../03-import-a-ai.md) a [01/Q1](../01-produkt.md).

Odhad je spočítaný z dat vlastní domácnosti a z ceníku Claude API. Na reálných voláních zatím ověřený
není (viz „Co ověřit“).

## Vstupy

### Objem pohybů (vlastní domácnost, září 2026)

Dva dospělí, 9 platebních účtů u 4 bank, zavedená pravidla.

| | Pohybů | Podíl |
|---|---|---|
| Celkem | 353 | 100 % |
| Převody mezi vlastními účty (pozná je server bez AI) | 139 | 39 % |
| Zařazeno pravidlem | 112 | 32 % |
| Zařazeno AI | 69 | 20 % |
| Zařazeno ručně | 35 | 10 % |

Z toho plyne:
- **Zaběhnutá domácnost:** AI řeší jen to, co nepokryjí převody a pravidla, tedy **≈ 100 pohybů měsíčně**.
- **Nová domácnost:** pravidla zatím nemá, takže AI dostane všechno kromě převodů, **≈ 210 pohybů měsíčně**.
  K tomu jednorázově historie po připojení banky. Počítám se 3 měsíci, tedy ≈ 630 pohybů.

### Tokeny

- **Jeden pohyb na vstupu ≈ 250 tokenů.** Patří sem obchodník, částka, datum, zpráva, původní text řádku,
  protiúčet, typ platby a 2–3 podobné dřív zařazené pohyby. V seznamu pohybů má záznam bez původního textu
  medián 150 znaků. Čeština se tokenizuje hůř než angličtina, proto beru odhad s rezervou.
- **Pevný kontext jednoho volání ≈ 3 000 tokenů:** instrukce, strom kategorií (105 kategorií) a poznámky.
  Volá se po dávkách 50 pohybů.
- **Výstup na pohyb ≈ 60 tokenů:** id kategorie, jistota a krátký důvod česky. K tomu přičítám rezervu na
  přemýšlení modelu, kterou na levnějších modelech jde vypnout nebo omezit.
- **Chat:** jedna zpráva ≈ 8 000 tokenů vstupu (historie a výsledky nástrojů) a 500 tokenů výstupu.

### Ceny (Claude API, USD za 1 mil. tokenů, stav 10/2026)

| Model | Vstup | Výstup | Poznámka |
|---|---|---|---|
| Claude Haiku 5.5 | 0,10 | 0,50 | nejlevnější |
| Claude Sonnet 5.5 | 2,00 | 10,00 | čtení z cache 0,20 |
| Claude Opus 5.5 | 4,00 | 20,00 | čtení z cache 0,20 |

Dávkové zpracování (Batch API, výsledek do 24 h) je o 50 % levnější. Hodí se pro noční kategorizaci.
Kurz pro přepočet: orientačně 23 Kč/USD.

## Výpočet

| Scénář | Tokeny (vstup / výstup) | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|---|
| Kategorizace, zaběhnutá domácnost (100 pohybů/měs.) | 31 tis. / 8 tis. | 0,007 $ | 0,14 $ | 0,28 $ |
| Kategorizace, první měsíc + 3 měsíce historie (630 pohybů, jednorázově) | 197 tis. / 48 tis. | 0,04 $ | 0,87 $ | 1,75 $ |
| Chat, běžné použití (20 zpráv/měs., bez cache) | 160 tis. / 10 tis. | 0,02 $ | 0,42 $ | 0,84 $ |
| Chat, intenzivní použití (60 zpráv/měs., bez cache) | 480 tis. / 30 tis. | 0,06 $ | 1,26 $ | 2,52 $ |
| Rozparsování PDF výpisu (záloha pro banky bez napojení, ~3 strany, 100 pohybů) | 9 tis. / 6 tis. | 0,004 $ | 0,08 $ | 0,16 $ |

### Na domácnost a měsíc (zaběhnutá domácnost + běžný chat)

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| USD | ≈ 0,03 | ≈ 0,56 | ≈ 1,12 |
| Kč | ≈ 1 | ≈ 13 | ≈ 26 |
| + jednorázově při připojení | ≈ 1 Kč | ≈ 20 Kč | ≈ 40 Kč |

U chatu sníží náklady prompt caching: u Sonnetu je čtení z cache 10× levnější než běžný vstup. Kategorizace
přes Batch API vyjde o polovinu levněji. Čísla v tabulce tedy berou horní odhad.

Pro srovnání: agregátor bankovních dat vychází u finAPI v betě na ≈ 260 €/měs. do 200 uživatelů, tedy ≈ 1,3 €
(≈ 32 Kč) na uživatele. **AI je i se Sonnetem levnější než napojení na banky.**

## Závěry

1. **Kategorizace stojí zanedbatelně i na silnějším modelu.** Většinu pohybů pokryjí převody a pravidla bez AI.
   AI se tak zbývající pohyby učí a navrhuje k nim pravidla, čímž se objem dál zmenšuje.
2. **Stačí levný model?** Cenově rozhoduje Haiku 5.5 (≈ 1 Kč za měsíc). Jestli kategorizuje dost dobře, je
   potřeba změřit. Vhodný je postup „Haiku pro jisté návrhy, Sonnet jen pro ty s nízkou jistotou“.
3. **Chat je největší a nejméně předvídatelná položka.** Při běžném použití je i se Sonnetem levný. Intenzivní
   uživatel ale náklady násobí, proto potřebuje limit zpráv nebo tokenů za měsíc (03/Q5) a případně vyšší tarif (07).
4. **Parsování výpisů napojení na banky skoro odstraní.** Zůstane jen jako záloha pro banky, které agregátor
   nepokrývá.
5. **Vestavěná AI na serveru je cenově reálná pro všechny.** Vlastní AI klient (MCP) tedy nemusí být
   podmínkou a může zůstat jako bonus. Tím se uvolňuje rozhodnutí 01/Q1.

## Co ověřit

- **Kvalita kategorizace podle modelu.** Domácnost má tisíce potvrzených pohybů, které můžou sloužit jako hotová
  testovací sada. Postup: vzít pohyby jednoho měsíce, dát modelu jen pravidla a historii před tímto měsícem
  a porovnat jeho návrhy s potvrzenými kategoriemi. Pustit Haiku 5.5 a Sonnet 5.5 a měřit přesnost a kalibraci
  jistoty. Stojí to jednotky dolarů.
- **Skutečné počty tokenů** (`count_tokens`) na reálném promptu v češtině místo odhadu.
- **Domácnosti bez zavedených pravidel a s jiným rozložením účtů** (jeden účet, víc karet, cizí měna).
- **Ostatní poskytovatelé AI** (levné modely jiných firem): do tohoto odhadu nejsou zahrnutí.

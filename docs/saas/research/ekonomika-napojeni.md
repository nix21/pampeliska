# Ekonomika napojení na banky

Stav k 3. 11. 2026 · Podklad pro [03/Q2](../03-import-a-ai.md) a [07/Q1](../07-predplatne.md) · Odpovědi
agregátorů v [poptávce](../poptavka-agregatori.md).

## Nabídky

| | Pevně / měs. | Za připojení | Další | Zdroj |
|---|---|---|---|---|
| **Enable Banking** (Startup package) | 900 € licence | 0,5 € za připojený účet a měsíc | 3letá zvýhodněná cena pro startupy (rozpis neuveden), neomezené stahování, celá EU | odpověď 11/2026 |
| **Salt Edge** (Partner Program) | od 1 000 € (minimum) | za aktivní připojení (souhlas), stupňovitě | jednorázový setup, měsíční údržba (MMC). Samoobslužný program s nižším závazkem má přijít „v příštích měsících“ | odpověď 11/2026 |
| **finAPI** (veřejný ceník) | 60 € Access + 200 € licence (do 200 uživatelů) + 20 € další země | v ceně do 200 uživatelů, pak stupně | neodpověděli, platí veřejný ceník | [rešerše](agregatory-cr.md) |
| **Finbricks** | ? | podle počtu napojení | cenu neuvedli | odpověď 11/2026 |
| **Tink** | ? | ? | neodpověděli | – |

## Předpoklady

- **Domácnost má 3–5 připojených účtů.** Tvoje domácnost má 9, je tedy nad průměrem.
- **Cena předplatného je s DPH.** Počítám 21 % DPH a platební poplatek ≈ 0,25 € + 1,5 %.
- **AI** ≈ 0,5 € na domácnost a měsíc (Sonnet 5.5, [naklady-ai.md](naklady-ai.md)).
- **Ostatní provoz** (server, e-maily, zálohy) ≈ 100 €/měs.
- **Salt Edge** jen minimem 1 000 €/měs., bez setupu a poplatku za připojení. Jeho skutečný bod zvratu je tedy vyšší.
- **finAPI** ve dvou variantách: uživatel = domácnost, nebo uživatel = osoba (2 na domácnost). Výklad zatím
  neznáme.
- Přepočet: orientačně 25 Kč/€.

Po DPH a platebním poplatku zbude z ceny 4 € ≈ 3,0 €, z 6 € ≈ 4,6 €, z 8 € ≈ 6,2 € a z 10 € ≈ 7,9 €.

## Náklady na napojení na domácnost a měsíc (5 účtů)

| Domácností | Enable Banking | Salt Edge (minimum) | finAPI (1 uživatel/dom.) | finAPI (2 uživatelé/dom.) |
|---|---|---|---|---|
| 50 (beta) | 20,5 € | ≥ 20,0 € | 5,6 € | 5,6 € |
| 100 | 11,5 € | ≥ 10,0 € | 2,8 € | 2,8 € |
| 200 | 7,0 € | ≥ 5,0 € | 1,4 € | 3,6 € |
| 500 | 4,3 € | ≥ 2,0 € | 1,4 € | 2,6 € |
| 1 000 | 3,4 € | ≥ 1,0 € | 1,3 € | 1,6 € |
| 2 000 | 3,0 € | ≥ 0,5 € | 0,8 € | 1,1 € |

**Enable Banking se nedostane pod 2,5 € na domácnost** (0,5 € × 5 účtů) ani při libovolném počtu domácností.
Cena za účet trestá domácnosti s víc bankami, tedy přesně cílovou skupinu.

## Bod zvratu (kolik platících domácností pokryje pevné náklady)

| Cena s DPH / měs. | Enable Banking (3 účty) | Enable Banking (5 účtů) | Salt Edge (minimum) | finAPI (1 / 2 uživatelé) |
|---|---|---|---|---|
| 4 € (≈ 100 Kč) | 1 005 | nikdy | 441 | 153 / 591 |
| 6 € (≈ 150 Kč) | 382 | 618 | 268 | 93 / 93 |
| 8 € (≈ 200 Kč) | 236 | 309 | 192 | 67 / 67 |
| 10 € (≈ 250 Kč) | 171 | 206 | 150 | 52 / 52 |

Pro srovnání ceny: Monarch stojí 99,99 $ ročně (≈ 7,7 € měsíčně).

## Beta zdarma (50 domácností, bez příjmů)

| | Za měsíc | Za rok |
|---|---|---|
| Enable Banking | ≈ 1 025 € | ≈ 12 300 € |
| Salt Edge | ≥ 1 000 € + setup | ≥ 12 000 € + setup |
| finAPI | ≈ 280 € | ≈ 3 400 € |

Trial 2 měsíce zdarma u Enable Banking stojí ≈ 6 € za každou zkoušející domácnost (2 × (2,5 € + 0,5 € AI)).
U domácnosti, která nezaplatí, jde o ztrátu.

## Závěry

1. **Napojení na banky dává smysl jen s cenou kolem 6–8 € měsíčně (150–200 Kč)**, tedy na úrovni Monarchu.
   Při 4 € (≈ 100 Kč) se s Enable Banking nezaplatí nikdy a se Salt Edge až při stovkách domácností.
2. **Enable Banking a Salt Edge se vyplatí až od ≈ 200–600 platících domácností.** Do té doby je pevná
   licence 900–1 000 €/měs. hlavní náklad celého projektu. Beta zdarma by s nimi stála ≈ 12 tis. € ročně.
3. **finAPI by podle veřejného ceníku vyšel na bod zvratu už při ≈ 70–150 domácnostech** a betu by zvládl
   za ≈ 3,4 tis. € ročně. Neví se ale, které české banky pokrývá, a na poptávku zatím neodpověděl. Vyplatí
   se ho připomenout.
4. **Přechod mezi agregátory je levnější, než se zdá.** Souhlas uživatel stejně obnovuje nejpozději po
   180 dnech, takže přechod jde rozložit do běžných obnov. Napojení je proto dobré stavět přes vlastní
   rozhraní, které nezávisí na konkrétním agregátorovi. Začít levným a přejít na Enable Banking nebo Salt
   Edge, až to objem ospravedlní, je reálná cesta.
5. **Počet připojených účtů je potřeba dát do ceníku** (např. 5 účtů v ceně, další za příplatek), nebo
   zvolit agregátora, který neúčtuje za účet.
6. **Na co se doptat:**
   - **Enable Banking:** co znamená „3-year ramp up discounted pricing“ v číslech? Pokrývá „full EU access“
     i uživatele s bydlištěm v ČR, když jejich dokumentace říká, že českým uživatelům službu neposkytují?
   - **Salt Edge:** kdy a za kolik spouští samoobslužný program, a jaký je poplatek za připojení?
   - **Finbricks:** konkrétní cena pro 250 a 2 500 připojení. Bez čísla nejde porovnat.

## Varianty pro rozhodnutí

| | Popis | Plus | Minus |
|---|---|---|---|
| A | Beta s napojením přes nejlevnějšího (finAPI, případně Finbricks pro ČR) | Řeší hlavní bolest od začátku, nízké pevné náklady | Závisí na pokrytí bank, které neznáme |
| B | Beta bez napojení: import souborů s AI, napojení až od ~200 platících | Žádné pevné náklady, ověří se zájem | Hlavní bolest (ruční stahování výpisů) zůstává, beta tím může vyznít slabě |
| C | Beta rovnou s Enable Banking nebo Salt Edge | Celá EU od startu | ≈ 12 tis. € ročně bez příjmů, splatí se až při stovkách platících |

# Kolik stojí získat 200 platících domácností (bez napojení na banky)

Stav k 3. 11. 2026 · Podklad pro [10/Q5](../10-znacka-web.md) a [03/Q2](../03-import-a-ai.md) (varianta B
v [ekonomice napojení](ekonomika-napojeni.md)).

Jde o hrubý odhad z veřejných benchmarků. Ty pochází hlavně z blogů dodavatelů a liší se podle toho, jak
měří konverzi. Vlastní data zatím nemáme.

## Benchmarky

| Ukazatel | Hodnota | Zdroj |
|---|---|---|
| Trial bez karty → placení | 4–9 % (zdroje se rozchází: 3–6 %, 8,9 %, 18 %) | Userpilot, ChartMogul (přes blog), First Page Sage |
| Trial s kartou předem → placení | 25–35 % (až 49 %) | Userpilot, First Page Sage |
| Návštěva → registrace do trialu | 8,5 % bez karty, 2,5 % s kartou | First Page Sage 2025 |
| Freemium → placení (mobilní aplikace, D35) | 2,1 % (tvrdý paywall 10,7 %) | RevenueCat 2026 |
| Meta reklama, CPC | ČR ≈ 1–2 $, Německo finance ≈ 2 €, finance obecně 2,3–4,5 $ | Adamigo, Superads, Contentstudio |

## Trychtýř

Pro výpočet beru cenu 6–8 € měsíčně s DPH. Po DPH a poplatcích z ní zbude ≈ 4,6–6,2 €, minus AI
≈ 0,5 €.

| Scénář | Proklik | Návštěva → registrace | Registrace → platící | Návštěva → platící | Cena za platícího (CAC) | Návštěv na 200 platících | Rozpočet na 200 |
|---|---|---|---|---|---|---|---|
| Pesimistický | 2,0 € | 3 % | 4 % | 0,12 % | ≈ 1 700 € | 167 tis. | ≈ 330 tis. € |
| Střední | 1,5 € | 5 % | 6 % | 0,30 % | ≈ 500 € | 67 tis. | ≈ 100 tis. € |
| Dobrý (trial bez karty) | 1,0 € | 8 % | 9 % | 0,72 % | ≈ 140 € | 28 tis. | ≈ 28 tis. € |
| Trial s kartou předem | 1,5 € | 2,5 % | 30 % | 0,75 % | ≈ 200 € | 27 tis. | ≈ 40 tis. € |

**Návratnost:** jeden platící vydělá ≈ 4–6 € měsíčně. Při CAC 150 € se náklad vrátí za 24–33 měsíců,
při CAC 500 € za 8 a víc let. K tomu odchody: bez napojení na banky musí uživatel každý měsíc ručně
stahovat výpisy, takže odchází častěji.

## Závěry

1. **Placenou reklamou se 200 platících bez napojení na banky nevyplatí.** Rozpočet vychází na 30–100 tis. €
   a víc a náklad se vrací roky. Při ceně 6–8 € měsíčně musí uživatelé přijít hlavně zadarmo.
2. **Reálné kanály jsou levné, ale stojí čas:**
   - vlastní síť a doporučení (rodina, kolegové, „pozvi další domácnost“),
   - komunity: české skupiny o osobních financích, r/eupersonalfinance, AI komunity,
   - jednorázová vlna: Show HN, Product Hunt, článek na Lupa.cz nebo Root.cz,
   - adresáře MCP konektorů a AI nástrojů, kde je cílovka, pro kterou ruční import přes AI není problém,
   - obsah a SEO (výsledky až po 6–12 měsících),
   - affiliate s finančními blogery a podcasty (provize třeba 1–2 měsíční platby).
   Peněžně jde o jednotky tisíc eur ročně, ale o 5–10 hodin práce týdně.
3. **Je 200 platících reálných?** Bez napojení na banky za první rok spíš ne pro běžné domácnosti. Výjimkou
   jsou uživatelé, kteří už mají vlastní AI (Claude, ChatGPT): pro ně je import přes AI snadný. Tahle skupina
   je ale menší a jde po ní i Monarch a Wallet s MCP. Na 200 platících je potřeba zhruba 2–3 tis. registrací.
4. **Napojení na banky zlevňuje i marketing.** Řeší hlavní bolest, takže zvedá konverzi i udržení. Napojení
   přes levného agregátora (≈ 3,4 tis. € ročně) je levnější než rozdíl v ceně za platícího. Varianta B šetří
   pevné náklady, ale zdražuje získání každého zákazníka.

## Jak to ověřit levně

Před rozhodnutím o napojení a rozpočtu to změřit místo benchmarků:

1. Landing page ve 2 variantách: „bankovní účty se načtou samy“ vs. „výpis nahraješ a AI ho roztřídí“.
   Obě vedou na waitlist.
2. Na každou variantu 300–500 € za reklamu v ČR (případně i v DE) na 2–3 týdny.
3. Měřit cenu prokliku, podíl zápisů na waitlist a rozdíl mezi variantami.

Výsledek dá vlastní čísla pro trychtýř a ukáže, kolik zájmu přidá napojení na banky.

## Zdroje

- [Userpilot – Free trial conversion rate](https://userpilot.com/blog/free-trial-conversion-rate/)
- [ChartMogul – The Conversion Report](https://chartmogul.com/reports/saas-conversion-report/)
- [Voxbooster – Free trial conversion statistics 2026](https://voxbooster.com/blog/free-trial-conversion-statistics-2026)
- [RevenueCat – State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps)
- [Adamigo – Meta Ads CPM & CPC Benchmarks by Country 2026](https://www.adamigo.ai/blog/meta-ads-cpm-cpc-benchmarks-by-country-2026)
- [Superads – Facebook CPC, finance, Germany](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/finance/germany)
- [ContentStudio – Meta ads benchmarks 2026](https://contentstudio.io/blog/meta-ads-benchmarks)

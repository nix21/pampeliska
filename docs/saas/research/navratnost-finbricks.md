# Návratnost projektu s nabídkou Finbricks

Stav k 6. 11. 2026 · Podklad pro [03/Q2](../03-import-a-ai.md), [07/Q1](../07-predplatne.md) a
[10/Q5](../10-znacka-web.md). Navazuje na [ekonomiku napojení](ekonomika-napojeni.md),
[náklady na AI](naklady-ai.md) a [marketing](marketing-200.md).

Jde o model, ne o předpověď. Největší neznámé jsou: kolik lidí přijde samo, kolik stojí zákazník z reklamy,
jak rychle lidé odchází a co Finbricks počítá jako jedno volání API.

## Nabídky (11/2026)

- **Finbricks:** startovací balíček **10 000 Kč měsíčně za 0–100 000 volání API**. Od 100 001 volání
  měsíčně platí standardní cena 30 000 Kč. **Vstupní poplatek je 25 000 Kč** jednorázově.
- **Enable Banking, Salt Edge a další:** po odmítnutí nabídli zhruba 500 €/měs. (≈ 12 500 Kč). To je pořád
  víc než Finbricks a k tomu se připočítávají poplatky za připojení.

**Pozor na trh:** Finbricks pokrývá střední a východní Evropu (hlavně ČR a SK) a podle ABRA mu chybí ČSOB
a UniCredit. Rozhodnutí „rovnou EU“ ([01/Q6](../01-produkt.md)) s ním nejde splnit. Buď se start zúží na
ČR (+SK) a EU přijde s druhým agregátorem, až to objem unese, nebo je potřeba jiný agregátor.

## Předpoklady

| Položka | Hodnota | Poznámka |
|---|---|---|
| Stahování | 1× denně každý účet, 2 volání (pohyby + zůstatek) | jak Finbricks volání počítá, je potřeba ověřit |
| Účtů na domácnost | 5 | |
| Volání na domácnost a měsíc | 300 | 100 000 volání tedy stačí na ≈ **333 domácností** (při 1 volání denně na ≈ 666) |
| Tarif s AI | 199 Kč/měs. s DPH | AI ≈ 13 Kč/měs. (Sonnet 5.5), podíl tarifu 70 % |
| Tarif s vlastní AI (MCP) | 149 Kč/měs. s DPH | podíl 30 % |
| DPH | 21 % | konzervativně. S.r.o. pod obratem 2 mil. Kč nemusí být plátce, ověřit s účetní |
| Platební poplatek | 1,5 % + ≈ 6 Kč | karta přes bránu |
| Ostatní provoz | 5 500 Kč/měs. | server a zálohy 3 000, účetní 2 000, nástroje, e-maily a vývojářské účty obchodů 500 |
| Jednorázově | ≈ 100 000 Kč | vstup Finbricks 25 000, právní texty ≈ 30 000, založení s.r.o. ≈ 10 000, web a značka ≈ 10 000, test kampaní ≈ 25 000 |
| Beta | 3 měsíce zdarma, 50 domácností. Po betě začne platit 40 % z nich | |
| Trial | 2 měsíce zdarma, platit pak začne ≈ 30 % | |
| Čas vývojáře | nepočítá se | AI na serveru, mobilní aplikace, podpora, marketing |

Z toho vychází čistý příjem na domácnost (po DPH, poplatku a AI): **tarif s AI ≈ 142 Kč, tarif s vlastní AI
≈ 115 Kč, v průměru ≈ 134 Kč měsíčně**.

## Bod zvratu bez reklamy

Pevné náklady jsou 15 500 Kč měsíčně (Finbricks 10 000 + provoz 5 500).

| Ceník (s AI / vlastní AI) | Čistý příjem na domácnost | Bod zvratu |
|---|---|---|
| 149 / 99 Kč | ≈ 94 Kč | **≈ 166 platících** |
| 199 / 149 Kč | ≈ 134 Kč | **≈ 115 platících** |
| 249 / 199 Kč | ≈ 175 Kč | **≈ 89 platících** |

## Simulace na 36 měsíců (ceník 199 / 149 Kč)

Scénáře:
- **Pesimistický:** 5 nových platících měsíčně bez reklamy, platící z reklamy za 4 000 Kč, odchod 6 % měsíčně.
- **Střední:** 12 nových měsíčně, z reklamy za 2 500 Kč, odchod 4 %.
- **Optimistický:** 25 nových měsíčně, z reklamy za 1 500 Kč, odchod 3 %.

„Propad“ je nejvyšší kumulovaná ztráta, tedy kolik peněz je potřeba mít připravených.

| Scénář | Reklama / měs. | Platících v m. 12 | v m. 24 | v m. 36 | Měsíční zisk od | Propad | Hotovost v m. 36 |
|---|---|---|---|---|---|---|---|
| Pesimistický | 0 | 41 | 63 | 74 | nikdy | −436 tis. | −436 tis. |
| Pesimistický | 10 000 | 55 | 92 | 109 | nikdy | −672 tis. | −672 tis. |
| Střední | 0 | 88 | 170 | 221 | 17. měsíc | −239 tis. | −82 tis. |
| Střední | 5 000 | 101 | 197 | 256 | 19. měsíc | −292 tis. | −238 tis. |
| Střední | 10 000 | 113 | 224 | 292 | 21. měsíc | −475 tis. | −475 tis. |
| Optimistický | 0 | 175 | 377 | 517 | 10. měsíc | −241 tis. | +103 tis. |
| Optimistický | 10 000 | 218 | 474 | 652 | 18. měsíc | −384 tis. | +35 tis. |
| Optimistický | 20 000 | 261 | 572 | 788 | 19. měsíc | −506 tis. | −12 tis. |

**Citlivost na počítání volání:** při 333 domácnostech skočí Finbricks z 10 000 na 30 000 Kč. Optimistický
scénář bez reklamy má v 36. měsíci +103 tis. Kč, když jeden účet stojí 2 volání denně. Při 1 volání denně
je to +563 tis. Kč. Na přesné počítání volání a na cenu nad 100 000 volání se proto musí Finbricks doptat
před podpisem.

## Závěry

1. **Projekt se s Finbricks může zaplatit**, protože pevné náklady jsou nízké a cena za domácnost se nemění.
   Při ceníku 199 / 149 Kč stačí ≈ 115 platících. Ve středním scénáři to vychází zhruba za 1,5 roku.
2. **Počítej s rezervou ≈ 250–450 tis. Kč** na první 2–3 roky (propad ve středním a pesimistickém scénáři
   bez reklamy), plus vlastní čas.
3. **Placená reklama se v tomhle modelu nezaplatí do 3 let.** Domácnost z reklamy stojí 1 500–4 000 Kč
   a přináší ≈ 134 Kč měsíčně, takže se náklad vrátí za 11–30 měsíců, a mezitím část lidí odejde. Reklama
   tedy jen jako test a s pevnou horní hranicí ceny za platícího ≈ **1 000–1 500 Kč**. Rozpočet pro začátek
   **5 000 Kč měsíčně**, a víc jen tehdy, když se ta hranice drží. Hlavní růst musí jít zdarma (komunity,
   doporučení, obsah, MCP adresáře).
4. **Rozhoduje, kolik lidí přijde samo a kolik jich odchází.** Rozdíl mezi 5 a 25 novými platícími měsíčně
   je rozdíl mezi projektem, který se nezaplatí, a projektem v zisku od 10. měsíce. Proto nejdřív levně
   změřit poptávku (landing page a waitlist, viz [marketing-200.md](marketing-200.md)) a teprve pak podepsat
   Finbricks.
5. **Roční předplatné** (např. 10 měsíců za cenu 12) zlepší peněžní tok i udržení. V modelu není, takže
   výsledky jsou spíš konzervativní.

## Doporučený ceník (vstup pro 07/Q1)

| Tarif | Měsíčně | Ročně | Obsah |
|---|---|---|---|
| **Pampeliška** (vlastní AI) | 149 Kč | 1 490 Kč | Napojení na banky, celá aplikace, MCP pro vlastního AI klienta |
| **Pampeliška + AI** | 199 Kč | 1 990 Kč | Navíc vestavěná AI: kategorizace, návrhy pravidel, chat s limitem (např. 100 zpráv měsíčně) |
| Bez napojení (volitelné) | zdarma nebo 49 Kč | – | Import souborů. Nic nestojí, slouží jako vstupní tarif |

- **Rozdíl 50 Kč za AI** (≈ 41 Kč bez DPH) pokrývá AI na Sonnetu (≈ 13 Kč) i intenzivnější chat. S Haiku pro
  kategorizaci je marže ještě vyšší.
- **Počet účtů v ceně:** například do 8 bankovních účtů na domácnost. Každý účet navíc znamená další volání
  API, a tedy dřívější skok na 30 000 Kč.
- **Mobilní aplikace:** předplatné prodávat na webu. Při prodeji přes App Store nebo Google Play si obchod
  vezme 15 % (program pro malé vývojáře) a čistý příjem klesne o ≈ 25 Kč. Jak je to s odkazem na nákup mimo
  obchod v EU, je potřeba ověřit.

## Na co se Finbricks zeptat před podpisem

- Co je jedno volání? Počítá se stažení pohybů a zůstatku jednoho účtu jako jedno, nebo dvě? Počítá se
  stránkování, obnova souhlasu, zakládání připojení?
- Kolik volání pokryje standardní cena 30 000 Kč a co je nad ní?
- Na jak dlouho platí startovací cena a s jakou výpovědní lhůtou?
- Pokrytí: ČSOB, UniCredit a Slovensko. Plánují ČSOB a UniCredit a kdy?
- Lze začít jen se sandboxem a vstupní poplatek zaplatit až před ostrým spuštěním?

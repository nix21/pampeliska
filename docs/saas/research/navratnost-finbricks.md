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

**Trh:** Finbricks pokrývá střední a východní Evropu (hlavně ČR a SK) a podle ABRA mu chybí ČSOB a UniCredit.
**Rozhodnuto 2026-11-06: start v ČR** (01/Q6).

## DPH: s.r.o., která není plátce

S.r.o. je založená a plátcem DPH není (limit 2 mil. Kč obratu za rok).

- **Příjmy jsou bez DPH.** Celá cena předplatného zůstane firmě, 21 % se neodvádí.
- **Náklady jsou s DPH, kterou nejde odečíst.** Tuzemští dodavatelé (Finbricks, pokud je plátce) účtují 21 %.
  U služeb ze zahraničí (Meta, Google, Anthropic, Stripe, zahraniční server) se s.r.o. stává
  **identifikovanou osobou** a DPH si odvádí sama. Reklama za 10 000 Kč tak ve skutečnosti stojí 12 100 Kč.
  Potvrdit s účetní.
- **Limit 2 mil. Kč** odpovídá zhruba **900 platícím domácnostem** v průměru za rok. Pak se firma stane
  plátcem a z každé platby odvede 21 %. Při stejných cenách klesne příjem na domácnost zhruba o šestinu.

## Předpoklady

| Položka | Hodnota | Poznámka |
|---|---|---|
| Stahování | 1× denně každý účet, 2 volání (pohyby + zůstatek) | jak Finbricks volání počítá, je potřeba ověřit |
| Účtů na domácnost | 5 | |
| Volání na domácnost a měsíc | 300 | 100 000 volání tedy stačí na ≈ **333 domácností** (při 1 volání denně na ≈ 666) |
| Finbricks | 10 000 Kč + 21 % = 12 100 Kč/měs. | předpoklad, že cena je bez DPH. Ověřit |
| Tarif s AI | 199 Kč/měs. | podíl 70 % |
| Tarif s vlastní AI (MCP) | 149 Kč/měs. | podíl 30 % |
| AI API (Claude) | ≈ 13 Kč + 21 % ≈ 16 Kč na domácnost a měsíc | Sonnet 5.5, kategorizace a běžný chat ([naklady-ai.md](naklady-ai.md)). S Haiku 5.5 ≈ 1 Kč |
| Platební poplatek | (1,5 % + ≈ 6 Kč) + 21 % | karta přes Stripe |
| Server | 30 € ≈ 750 Kč + 21 % ≈ 900 Kč/měs. | |
| Účetní a nástroje | 2 500 Kč/měs. | |
| Jednorázově | ≈ 70 000 Kč | vstup Finbricks 30 250 Kč s DPH, právní texty ≈ 30 000, web a značka ≈ 10 000 (s.r.o. už je) |
| Beta | 3 měsíce zdarma, 50 domácností. Po betě začne platit 40 % z nich | |
| Trial | 2 měsíce zdarma, platit pak začne ≈ 30 % | |
| Čas vývojáře | nepočítá se | AI na serveru, mobilní aplikace, podpora, marketing |

Z toho vychází čistý příjem na domácnost (po poplatku a AI): **tarif s AI ≈ 172 Kč, tarif s vlastní AI
≈ 139 Kč, v průměru ≈ 162 Kč měsíčně**.

**Kolik stojí AI API celkem:** při 100 domácnostech s AI zhruba 1 600 Kč měsíčně na Sonnetu, nebo zhruba
120 Kč na Haiku. U chatu je potřeba limit zpráv, aby jeden intenzivní uživatel nezvedl náklady (03/Q5).

## Bod zvratu bez reklamy

Pevné náklady jsou ≈ 15 500 Kč měsíčně (Finbricks 12 100 + server 900 + účetní a nástroje 2 500).
**Stačí ≈ 95 platících domácností** (ceník 199 / 149 Kč).

## Kolik smí stát zákazník z reklamy

| Odchod za měsíc | Průměrná doba předplatného | Hodnota zákazníka (LTV) |
|---|---|---|
| 6 % | 17 měsíců | ≈ 2 700 Kč |
| 4 % | 25 měsíců | ≈ 4 100 Kč |
| 3 % | 33 měsíců | ≈ 5 400 Kč |

Aby se reklama vrátila zhruba do roka, nesmí jedna platící domácnost z reklamy stát víc než
**≈ 1 500 Kč včetně DPH**. Se střední hodnotou zákazníka by šlo i o něco víc, peníze se ale vrací pomalu.

## Simulace na 36 měsíců (ceník 199 / 149 Kč)

Scénáře:
- **Pesimistický:** 5 nových platících měsíčně bez reklamy, platící z reklamy za 4 000 Kč, odchod 6 % měsíčně.
- **Střední:** 12 nových měsíčně, z reklamy za 2 500 Kč, odchod 4 %.
- **Optimistický:** 25 nových měsíčně, z reklamy za 1 500 Kč, odchod 3 %.

„Reklama“ je rozpočet bez DPH. Model k němu přičítá 21 %. „Propad“ je nejvyšší kumulovaná ztráta, tedy kolik
peněz je potřeba mít připravených.

| Scénář | Reklama / měs. | Platících v m. 12 | v m. 24 | v m. 36 | Měsíční zisk od | Propad | Hotovost v m. 36 |
|---|---|---|---|---|---|---|---|
| Pesimistický | 0 | 41 | 63 | 74 | nikdy | −360 tis. | −360 tis. |
| Pesimistický | 10 000 | 58 | 98 | 117 | nikdy | −622 tis. | −622 tis. |
| Střední | 0 | 88 | 170 | 221 | 14. měsíc | −192 tis. | +69 tis. |
| Střední | 5 000 | 103 | 203 | 264 | 16. měsíc | −245 tis. | −171 tis. |
| Střední | 10 000 | 118 | 236 | 307 | 18. měsíc | −410 tis. | −410 tis. |
| Optimistický | 0 | 175 | 377 | 517 | 9. měsíc | −187 tis. | +293 tis. |
| Optimistický | 5 000 | 201 | 436 | 599 | 17. měsíc | −279 tis. | +280 tis. |
| Optimistický | 10 000 | 227 | 495 | 681 | 17. měsíc | −371 tis. | +268 tis. |
| Optimistický | 20 000 | 278 | 613 | 845 | 17. měsíc | −505 tis. | +292 tis. |

**Co z toho plyne pro reklamu:** v optimistickém scénáři (domácnost z reklamy za 1 500 Kč) vychází hotovost
po třech letech zhruba stejně s reklamou i bez ní, ale s reklamou je o 60 % víc zákazníků. To se vyplatí
v dalších letech. Ve středním scénáři (2 500 Kč) reklama do 3 let prodělává. Rozhoduje tedy, jestli se cena
za platící domácnost udrží do ≈ 1 500 Kč.

**Citlivost na počítání volání:** při 333 domácnostech skočí Finbricks z 12 100 na 36 300 Kč (s DPH). Pokud
jeden účet stojí 1 volání denně místo 2, posune se ta hranice na ≈ 666 domácností.

## Závěry

1. **Projekt se s Finbricks může zaplatit.** Bez DPH na příjmech stačí ≈ 95 platících. Ve středním scénáři
   je projekt v zisku od 14. měsíce.
2. **Počítej s rezervou ≈ 200–400 tis. Kč** na první 2–3 roky (propad ve středním a pesimistickém scénáři),
   plus vlastní čas. S reklamou za 10 000 Kč měsíčně se rezerva zvedne na ≈ 370–620 tis. Kč.
3. **Reklama ano, ale řízená cenou za zákazníka:** začít s ≈ 10 000 Kč měsíčně bez DPH, po 6–8 týdnech
   vyhodnotit. Pod 1 500 Kč za platící domácnost navyšovat, nad 2 500 Kč kanál zastavit. Postup je ve
   [10/Q5](../10-znacka-web.md).
4. **Rozhoduje, kolik lidí přijde samo a kolik jich odchází.** Rozdíl mezi 5 a 25 novými platícími měsíčně
   je rozdíl mezi projektem, který se nezaplatí, a projektem v zisku od 9. měsíce. Proto nejdřív levně
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

- **Rozdíl 50 Kč za AI** pokrývá AI na Sonnetu (≈ 16 Kč s DPH) i intenzivnější chat. S Haiku pro kategorizaci
  je marže ještě vyšší.
- **Počet účtů v ceně:** například do 8 bankovních účtů na domácnost. Každý účet navíc znamená další volání
  API, a tedy dřívější skok na 30 000 Kč.
- **Ceny jsou konečné.** Když firma po 2 mil. obratu začne být plátcem, buď ceny zvýší, nebo přijde zhruba
  o šestinu příjmu.
- **Mobilní aplikace:** předplatné prodávat na webu. Při prodeji přes App Store nebo Google Play si obchod
  vezme 15 % (program pro malé vývojáře). Jak je to s odkazem na nákup mimo obchod v EU, je potřeba ověřit.

## Na co se Finbricks zeptat před podpisem

- Je cena 10 000 / 30 000 Kč bez DPH?
- Co je jedno volání? Počítá se stažení pohybů a zůstatku jednoho účtu jako jedno, nebo dvě? Počítá se
  stránkování, obnova souhlasu, zakládání připojení?
- Kolik volání pokryje standardní cena 30 000 Kč a co je nad ní?
- Na jak dlouho platí startovací cena a s jakou výpovědní lhůtou?
- Pokrytí: ČSOB, UniCredit a Slovensko. Plánují ČSOB a UniCredit a kdy?
- Lze začít jen se sandboxem a vstupní poplatek zaplatit až před ostrým spuštěním?

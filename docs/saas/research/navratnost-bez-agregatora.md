# Návratnost bez napojení na banky, celosvětově

Stav k 11. 11. 2026 · Podklad pro [03/Q2](../03-import-a-ai.md), [07/Q1](../07-predplatne.md) a
[10/Q5](../10-znacka-web.md). Nahrazuje [návratnost s Finbricks](navratnost-finbricks.md), ze které přebírá
scénáře, aby šly výsledky porovnat.

Jde o model, ne o předpověď. Největší neznámé zůstávají: kolik lidí přijde samo, kolik stojí zákazník
z reklamy a jak rychle lidé odchází.

## Co se změnilo proti variantě s Finbricks

- **Žádný agregátor:** odpadá 12 100 Kč měsíčně a 30 250 Kč vstupního poplatku (obojí s DPH).
- **Data:** výpisy, které uživatel přepošle e-mailem nebo nahraje. Přečte je AI na serveru ([03/Q1](../03-import-a-ai.md)).
- **Trh celý svět, ceny v EUR, USD a Kč.** Prodej přes **merchant of record** (Paddle, Lemon Squeezy apod.).
  Ten je vůči zákazníkovi prodejcem, odvádí DPH a sales tax ve všech zemích a s.r.o. prodává jen jemu.
  S.r.o. tak zůstává neplátcem, ale z ceny zákazníka odejde DPH jeho země (v EU 17–27 %).

## Předpoklady

| Položka | Hodnota | Poznámka |
|---|---|---|
| Kurz | 1 € = 25 Kč, 1 $ = 23 Kč | |
| DPH zákazníka | průměrně 20 %, ceny v EU včetně DPH | odvádí merchant of record |
| Poplatek merchant of record | (5 % + 0,50 $) + 21 % | zahraniční služba → s.r.o. si DPH odvede sama |
| Tarif s AI | podíl 70 % | |
| Tarif s vlastní AI (MCP) | podíl 30 % | |
| AI API (Claude) | ≈ 18 Kč + 21 % ≈ 22 Kč na domácnost a měsíc | Sonnet 5.5: kategorizace a chat 13 Kč, čtení výpisů ≈ 5 Kč |
| Server | 30 € + 21 % ≈ 900 Kč/měs. | |
| Příjem e-mailů | 15 $ + 21 % ≈ 420 Kč/měs. | např. Postmark, Mailgun |
| Účetní a nástroje | 2 500 Kč/měs. | |
| Jednorázově | ≈ 40 000 Kč | právní texty ≈ 30 000 (závazně anglicky), web a značka ≈ 10 000. Překlady dělá AI |
| Beta, trial | jako u varianty s Finbricks | 3 měsíce bety pro 50 domácností, 40 % pak platí. Trial 2 měsíce, 30 % platí |

Pevné náklady jsou **≈ 3 800 Kč měsíčně** (s Finbricks ≈ 15 500 Kč).

## Dvě varianty ceníku

| Ceník (vlastní AI / s AI) | Čistě na domácnost | Bod zvratu | LTV při odchodu 6 / 4 / 3 % |
|---|---|---|---|
| **5 € / 7 €** | ≈ 94 Kč (83 / 100) | **≈ 40 platících** | 1 600 / 2 400 / 3 200 Kč |
| **6 € / 9 €** | ≈ 127 Kč (102 / 138) | **≈ 30 platících** | 2 100 / 3 200 / 4 200 Kč |

Na domácnost zbude méně než v ČR bez DPH (162 Kč). Ve světě se DPH zákazníka platit musí, část jde
merchant of record a pevná složka poplatku (0,50 $) je u měsíčních plateb citelná. Roční předplatné ji
rozpustí.

## Regionální ceny (doplněno 2026-11-13)

Pásmo A (USA, UK, DACH, sever, Benelux, Francie) 6 € / 9 €, pásmo B (ČR, SK, PL, Pobaltí, jih Evropy)
≈ o 35 % levněji, v ČR 99 / 149 Kč (viz [07/Q1](../07-predplatne.md)).

| Pásmo | Čistě na domácnost (vlastní AI / s AI) | Průměr |
|---|---|---|
| A | 102 / 138 Kč | 127 Kč |
| B (ČR 99 / 149 Kč) | 62 / 78 Kč | 73 Kč |

| Podíl platících z pásma A | Průměr na domácnost | Bod zvratu |
|---|---|---|
| 100 % | 127 Kč | 30 |
| 70 % | 111 Kč | 34 |
| 50 % | 100 Kč | 38 |
| 30 % | 90 Kč | 43 |
| 0 % (jen pásmo B) | 73 Kč | 52 |

Pevná část poplatku (0,50 $) je u ceny 99 Kč ≈ 12 %. Roční předplatné za 10 měsíců vyjde čistě stejně
jako měsíční, ale peníze přijdou dopředu a zákazník zůstane déle. V pásmu B ho proto nabízet jako výchozí.

## Simulace na 36 měsíců (ceník 6 € / 9 €)

Stejné scénáře jako u Finbricks: pesimistický 5 nových platících měsíčně bez reklamy, z reklamy za
4 000 Kč, odchod 6 %. Střední 12 / 2 500 Kč / 4 %. Optimistický 25 / 1 500 Kč / 3 %.

| Scénář | Reklama / měs. | Platících v m. 12 | v m. 24 | v m. 36 | Zisk od | Propad | Hotovost v m. 36 |
|---|---|---|---|---|---|---|---|
| Pesimistický | 0 | 41 | 63 | 74 | 10. měsíce | −62 tis. | +24 tis. |
| Pesimistický | 5 000 | 50 | 80 | 95 | 26. měsíce | −134 tis. | −124 tis. |
| Střední | 0 | 88 | 170 | 221 | 7. měsíce | −61 tis. | +351 tis. |
| Střední | 5 000 | 103 | 203 | 264 | 11. měsíce | −92 tis. | +249 tis. |
| Střední | 10 000 | 118 | 236 | 307 | 14. měsíce | −139 tis. | +148 tis. |
| Optimistický | 0 | 175 | 377 | 517 | 7. měsíce | −62 tis. | +982 tis. |
| Optimistický | 10 000 | 227 | 495 | 681 | 10. měsíce | −114 tis. | +941 tis. |

Pro srovnání s Finbricks (ceník 199 / 149 Kč, jen ČR): střední scénář bez reklamy byl v zisku od
14. měsíce s propadem −192 tis. a +69 tis. po třech letech. Pesimistický se nezaplatil nikdy (−360 tis.).

U ceníku 5 € / 7 € vychází střední scénář bez reklamy na +203 tis. a pesimistický na −33 tis.

## Závěry

1. **Riziko klesne zhruba na třetinu.** Propad je ≈ 60–140 tis. Kč místo 190–620 tis. Kč a ani
   pesimistický scénář bez reklamy nekončí velkou ztrátou.
2. **Bod zvratu ≈ 30–40 platících** místo 95. Na to stačí první beta a vlastní síť.
3. **Doporučený ceník 6 € / 9 € měsíčně** (USD 7 / 10, Kč 149 / 219), ročně 60 € / 90 €. Pořád levnější než
   Lunch Money (≈ 10 $), YNAB a Monarch (14,99 $), které ale mají napojení na banky.
4. **Reklama smí stát ≈ 1 300 Kč na platící domácnost včetně DPH**, aby se vrátila do roka. Ve středním
   scénáři se reklama do 3 let nevyplatí, v optimistickém přidá zákazníky bez ztráty hotovosti. Rozhoduje
   test reklamy na hotové betě ([10/Q5](../10-znacka-web.md)).
5. **Napojení na banky se vrátí na stůl,** až bude dost platících v jednom regionu, aby agregátor pokryl
   z jejich plateb fixní poplatek. Pro ČR s Finbricks je to ≈ 100–150 platících z ČR.

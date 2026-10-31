# Konkurence: jak aplikace řeší více členů jedné domácnosti

Rešerše k 31. 10. 2026. Primární zdroje jsou help centra, ceníky a changelogy výrobců.
Tvrzení, která šla doložit jen srovnávacím nebo affiliate webem, jsou označená
**„neověřeno (jen sekundární zdroj)“**. Některá help centra (Monarch, BudgetBakers, Lunch Money)
blokují automatické stahování (HTTP 403). U nich vycházím z oficiálních stránek, které načíst šly,
a z úryvků jejich help center ve výsledcích vyhledávání. U každého takového místa to uvádím.

## 1. Shrnutí

1. **Model „moje / tvoje / naše“ jako vlastnictví účtu i pohybu má z velkých aplikací jen Monarch**
   (Shared Views, 22. 10. 2025). Vlastníkem může být člen nebo „Shared“, pohyby ho dědí z účtu
   a filtrovat podle něj jde v pohybech, reportech a cash flow. Pořád ale chybí tři věci:
   **rozpočet za člena** (blog výslovně uvádí, že rozpočet zvlášť zatím nejde),
   **soukromí** (oficiální stránka Collaboration: členové mají „full visibility into all accounts and transactions“)
   a **podíly a vyrovnání** (vlastník je jeden člen nebo „Shared“, procentní podíl neexistuje a Bill Split Monarch ruší).
2. **Soukromí před partnerem nabízejí hlavně menší aplikace pro páry:** Honeydue (ke každému účtu
   „vše / jen zůstatek / nic“, skrytí jednotlivého pohybu), Lumio UK (soukromý a sdílený prostor,
   sdílení po pohybech), Emma Spaces (každý do sdíleného prostoru přidá jen své účty)
   a z evropských Wallet by BudgetBakers (oprávnění člena po účtech: Admin / Track and read / Read only / No access).
3. **Vyrovnání „kdo komu dluží“ dělají jen Honeydue, Lumio (IOU s poměrem 50/50, 60/40) a Emma Groups**
   (spíš jako Splitwise pro skupiny). Ani jedna z nich tyto podíly nepromítá do rozpočtů nebo
   predikcí za člena. **Kombinaci, kterou má Pampeliška (podíl člena na společném účtu, rozpočítání
   podle držitele karty, pohledy, rozpočty a predikce za člena), jsem u nikoho nenašel.**
4. **Převody mezi vlastními účty rozpoznávají skoro všichni** (Monarch, Simplifi, Emma, Wallet,
   YNAB jako typ „transfer“). Většinou ale jen mezi účty, které jsou v aplikaci napojené.
   **Výslovné párování převodu mezi účty různých členů jsem nenašel v žádné dokumentaci.**
   U Monarchu a dalších „jedna domácnost = jeden datový prostor“ to vyjde implicitně,
   protože všechny účty jsou v jedné domácnosti. U aplikací, kde má každý svůj účet
   (Honeydue, Lumio, Emma), to nikde popsané není.
5. **USA jsou obsazené a „rodinný pohled“ se tam rychle stává standardem:** Monarch (členové
   zdarma, Shared Views, od 10/2026 oficiální MCP), YNAB Together (až 6 lidí), Rocket Money (2 lidé),
   Simplifi (+1 člověk, jen plný přístup), Lunch Money (neomezeně spolupracovníků), Copilot
   (Households až 3 lidé „coming this fall“). Vstup s Pampeliškou do USA by znamenal souboj
   s Monarchem, který má přímé napojení na banky (Plaid, MX, Mastercard/Finicity), MCP i AI asistenta.
6. **Evropa je výrazně slabší:** Finanzguru (DE, trh 4000+ bank) rodinnou funkci nemá, nabízí
   jen samostatnou appku „Split by Finanzguru“. MoneyMoney a Outbank jsou čistě pro jednoho uživatele
   s lokálními daty. Moneyhub ukončil spotřebitelskou appku (podle sekundárních zdrojů k 14. 8. 2026).
   Emma a Lumio jsou UK-centrické. Nejblíž má Wallet by BudgetBakers (CZ): sdílení skupiny
   s oprávněními po účtech, ale bez vlastníka pohybu, podílů a pohledu za člena. Wallet má navíc MCP
   (Claude, ChatGPT), takže AI přes MCP v Evropě sama o sobě rozdílem není.
7. **Banky v EU tlačí na páry vlastními nástroji** (N26 Joint Accounts ve 21 zemích, filtr výdajů
   podle účastníka). To ale pokrývá jen jednu banku. Pozicování Pampelišky „více bank, moje / tvoje / naše,
   podíly“ je v Evropě reálná mezera. V USA je mezera užší: podíly, vyrovnání, rozpočet a predikce
   za člena a soukromí v kombinaci s plným rodinným pohledem.
8. **Riziko pro Evropu:** konkurenti mají přímé napojení na banky (Salt Edge, GoCardless, Plaid EU,
   Tink, vlastní FinTS) a Pampeliška zatím jen import přes AI. U párů s více bankami je bariéra
   „nahraj výpis“ citelná. Výhodou může být, že AI import funguje i u bank, které agregátory
   nepokrývají (CZ/SK malé banky).

## 2. Srovnávací tabulka

Legenda: ✔ ano, ✘ ne, ~ částečně / s omezením, ? neověřeno.

| Aplikace | 1 Členové, přihlášení, cena za další | 2 Vlastnictví účtů a pohybů, pohled za člena | 3 Skrytí před partnerem | 4 Společné účty, dělení, vyrovnání | 5 Převody (vlastní / mezi členy) | 6 Napojení bank / ruční import | 7 Cena, platformy, trhy | 8 AI |
|---|---|---|---|---|---|---|---|---|
| **Monarch** (US) | neomezeně (bez uvedeného limitu), vlastní login, zdarma | ✔ vlastník = člen nebo „Shared“ na účtu i pohybu, filtr Owners v pohybech, reportech, cash flow. Rozpočet za člena ✘ | ✘ všechno vidí všichni | ~ účet „Shared“, bez % podílů. Bill Split ruší | ✔ kategorie Transfer mimo cash flow a rozpočet. Mezi členy implicitně (jedna domácnost) | Plaid, MX, Mastercard (Finicity). US + Kanada. CSV ano | $14.99/měs., $99.99/rok, Plus tier (04/2026). Web, iOS, Android | AI asistent, oficiální MCP (10/2026) |
| **YNAB Together** (US) | 2–6 lidí, vlastní login, v ceně 1 předplatného | ~ sdílení po celých rozpočtech (plans), vlastník pohybu ✘ | ~ nesdílený rozpočet, ale Group Manager vidí vždy všechno | ✘ (doporučuje split + Splitwise) | ✔ typ transfer | US, CA, UK?, vybrané EU (Plaid, dříve TrueLayer) | $14.99/měs., $109/rok, 34 dní zdarma. Web, iOS, Android | ✘ oficiálně (jen komunitní MCP) |
| **Copilot Money** (US) | dnes sdílený login (magic link). Households až 3 lidé „coming soon“ | ~ tagy, kategorie podle osoby | ✘ | ✘ | ? | jen US účty | $109/rok (~$9/měs.). iPhone, iPad, Mac, web. Android ✘ | Copilot Intelligence (kategorizace), Money Assistant (beta) |
| **Honeydue** (US) | pár (2), každý vlastní účet, zdarma | ✔ účty patří tomu, kdo je připojil | ✔ po účtech (vše / jen zůstatek / nic) i po pohybech | ✔ Splits, chat k pohybu. Vyrovnání ~ (detaily jen sekundárně) | ? | 20 000+ institucí v 5 zemích (US, CA, UK, ES, FR) | zdarma. iOS, Android | ? |
| **Quicken Simplifi** (US) | +1 člen, vlastní Quicken ID, bez dalšího předplatného | ✘ | ✘ jen plný přístup | ✘ | ✔ automatická detekce, mimo Spending Plan a reporty | US + Kanada | $3.99/měs. ročně (běžně $6.99). Web, iOS, Android | ? |
| **Rocket Money** (US) | 2 lidé, vlastní login, stačí 1× Premium | ✘ | ✘ výslovně nelze | ✘ | ? | US | Premium (cena variabilní, neověřeno). Web, iOS, Android | ? |
| **Lunch Money** (US/global) | neomezeně spolupracovníků, platí jen admin rozpočtu | ~ jen „Linked by“ u účtu | ? | ~ split transakce, bez vyrovnání | ~ obě strany převodu, ruční seskupení | Plaid (US, CA, FR, NL, ES, IE, DE), CSV, API | $10/měs., 30 dní zdarma. Web | ? |
| **Finanzguru** (DE) | ✘ rodinná funkce není (sdílený login / samostatná app Split) | ✘ | – | ✘ (app „Split by Finanzguru“ zvlášť) | ? | 4000+ bank a poskytovatelů (DE) | zdarma + Plus 0,99 €/týden. iOS, Android | AI companion (dotazy), návrhy úspor |
| **Wallet by BudgetBakers** (CZ) | skupina až 10 členů (2017), vlastní login, Premium stačí vlastníkovi | ~ účet má vlastníka (kdo sdílí), pohled za člena ✘ | ✔ po účtech: Admin / Track and read / Read only / No access | ~ sdílené účty, rozpočty. Podíly a vyrovnání ✘ | ✔ transfer mimo statistiky. Mezi napojenými účty automaticky | 15 000+ bank (Salt Edge, Yodlee), CSV | Free / Premium / Lifetime (ceny jen sekundárně). Web, iOS, Android. Sdílení jen v mobilu | MCP (Claude, ChatGPT…), REST API |
| **Spendee** (CZ) | sdílená peněženka, pozvaní zdarma, vlastník Plus/Premium | ✘ | ~ sdílí se jen vybraná cash peněženka. Bankovní peněženky sdílet nejde | ~ všichni editují vše, rozpočty každý zvlášť | ✔ ruční převod mimo výdaje a příjmy (v cash flow ano) | 2500+ poskytovatelů, CSV/XLS | Plus $1.99/měs. / $14.99/rok, Premium $5.99 / $35.99, 7 dní zdarma. iOS, Android, web | Magic AI Scan (účtenky) |
| **Emma** (UK) | Emma Family: +3 členové k Ultimate. Spaces sdílené s dalšími uživateli | ✔ každý přidává do Space jen své účty | ✔ co nepřidáš do sdíleného Space, partner nevidí. Private space sdílet nejde | ~ Groups: dělení a vyrovnání (Splitwise-like) | ✔ automaticky, pokud jsou oba účty napojené | Open Banking UK (+ další, neověřeno) | Plus £4.99, Pro £9.99, Ultimate £14.99/měs. (sekundárně). iOS, Android | ? |
| **Moneyhub** (UK) | ✘ (jen sdílený login) | ✘ | – | ✘ | – | – | spotřebitelská app ukončena (sekundárně k 14. 8. 2026) | – |
| **Outbank** (DE) | ✘ jeden uživatel, sync mezi zařízeními | ✘ | – | ✘ | ? | 4500+ bank a platebních služeb | 3,99 €/měs. nebo 39,99 €/rok (sekundárně), 14 dní zdarma. iOS, Mac, Android | ✘ |
| **MoneyMoney** (DE) | ✘ jeden Mac, lokální databáze | ✘ | – | ✘ | ? | vlastní FinTS/HBCI, 6500+ bank v Evropě | 79,99 € jednorázově. jen macOS | ✘ |
| **Lumio** (UK, pro páry) | pár, každý vlastní účet. Couples Pro £4.50/měs. | ✔ soukromý vs. sdílený prostor, společné účty se označí jako joint | ✔ sdílení po pohybech i účtech | ✔ IOU tracker s poměrem (50/50, 60/40) | ? | Open Banking UK | Free / Pro / Couples Pro £39.99/rok (sekundárně). iOS, Android | ? |
| **Pampeliška** (pro srovnání) | více členů, Owner/Member, rozsah All / OwnAndJoint | ✔ účet vlastní / společný, podíly. Pohled, rozpočty a predikce za člena | ✔ OwnAndJoint (cizí vlastní účty nevidí) | ✔ podíly na účtu i podle držitele karty | ✔ i mezi účty různých členů | zatím jen AI import (MCP) | – | MCP, AI import a kategorizace |

## 3. Detail po aplikacích

### USA

#### Monarch Money
- **Členové a cena:** členy domácnosti lze přidat „one or more“, stojí to nic („costs nothing to add other members“),
  každý má vlastní login ([Collaboration](https://www.monarch.com/features/collaboration), načteno 31. 10. 2026).
  Role admin (vlastník předplatného) a member. Pozvat jde i poradce
  ([Monarch for Couples](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples), úryvek z vyhledávání, stránka vrací 403).
- **Vlastnictví („Shared Views“, 22. 10. 2025):** účtům a pohybům lze přiřadit vlastníka (já / partner / „ours“).
  Pohyby dědí vlastníka z účtu, jde ho změnit ručně nebo pravidlem. Filtr „Owners“ ukáže jen moje,
  jen partnerovo nebo obojí v účtech, pohybech, reportech, cash flow a čistém jmění
  ([blog Shared Views](https://www.monarch.com/blog/shared-views)). Pravidla umí podmínku i akci podle vlastníka
  ([Transaction Rules](https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules), úryvek).
  Vlastníkem může být jen člen domácnosti a funkce běží jen v domácnostech s více členy
  ([Shared Views in Monarch](https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch), úryvek, 403).
- **Rozpočet za člena:** ✘. Blog: „we don't currently offer a way to budget separately“, Monarch prý vlastnictví do rozpočtu zvažuje.
  Changelog do 31. 10. 2026 o rozpočtu podle vlastníka nic nehlásí ([What's New](https://www.monarch.com/whats-new)).
- **Soukromí:** ✘. Stránka Collaboration: členové dostanou „full visibility into all accounts and transactions“.
  Help center (Getting Started, Shared Views, úryvky): účty nejde skrýt před konkrétními členy „at this time“.
  „Skrytí účtu“ v nastavení ho schová jen z pohledu a v Institution Settings ho ostatní pořád vidí
  ([Hiding an Account](https://help.monarch.com/hc/en-us/articles/4407859794580), úryvek).
  Některé recenze (např. Penny Hoarder, NerdWallet 2026) tvrdí opak. To je **v rozporu s oficiálními zdroji, platí oficiální**.
  **Stav potvrzen: ani k 10/2026 skrytí před členy neexistuje.**
- **Dělení:** jen vlastník „Shared“, bez procentních podílů. Jednorázový „Bill Split“ (rozúčtování účtenky
  přes Venmo) Monarch ruší k 19. 6. (rok v úryvku neuveden) ([Bill Split](https://help.monarch.com/hc/en-us/articles/45825314071060-Bill-Split), úryvek).
- **Převody:** kategorie Transfer a Credit Card Payment se nepočítají do rozpočtu ani cash flow
  ([Transfers and Credit Card Payments](https://help.monarch.com/hc/en-us/articles/360048393292), [Budget](https://help.monarch.com/hc/en-us/articles/360048883631-Budget), úryvky).
  Převod mezi účty dvou členů není samostatně popsaný. Všechny účty jsou ale v jedné domácnosti, takže funguje stejně.
- **Banky:** Plaid, MX a Mastercard Data Connect (dříve Finicity) ([Guide to Connecting Your Accounts](https://help.monarch.com/hc/en-us/articles/360048393352), úryvek).
  Země: US a Kanada (ceník odkazuje na „Monarch in Canada“). Mimo US/CA **neověřeno, podle sekundárních zdrojů ne**.
- **Cena:** $14.99/měs., $99.99/rok, první týden zdarma ([Pricing](https://www.monarch.com/pricing)).
  Tier Plus od 20. 4. 2026 (plánování, podnikání). Cena Plus ~$199/rok je **neověřená (jen sekundární zdroj)**.
  Platformy web, iOS, Android.
- **AI:** AI asistent (zrychlený 29. 9. 2026). **Oficiální Monarch MCP od 21. 10. 2026** pro Claude, ChatGPT, Cursor a Gemini CLI
  ([What's New](https://www.monarch.com/whats-new), [MCP Connector](https://help.monarch.com/hc/en-us/articles/50207234679956-Monarch-MCP-Connector), úryvek).
- Kontext: Monarch oznámil 1. 10. 2026 $100M ARR ([What's New](https://www.monarch.com/whats-new)).

#### YNAB (YNAB Together)
- **Členové:** skupina 2–6 lidí, každý má vlastní účet a login, vše v ceně jednoho předplatného, které platí Group Manager
  ([YNAB Together](https://www.ynab.com/ynab-together), [Pricing](https://ynab.com/pricing)).
- **Vlastnictví / soukromí:** sdílí se po celých rozpočtech („plans“). Člen si může vytvořit vlastní rozpočet
  a nesdílet ho, ale „all budgets are always shared with the Group Manager“. Vlastník pohybu a pohled za člena v jednom rozpočtu ✘.
- **Dělení:** nativně ✘. YNAB doporučuje split transakce a Splitwise
  ([Splitwise and YNAB](https://support.ynab.com/en_us/splitwise-and-ynab-a-guide-H1GwOyuCq.md)).
- **Převody:** typ transfer mezi účty, mezi hotovostními účty bez kategorie. První převod mezi napojenými účty se může
  naimportovat jako běžná transakce ([Transfer Transactions](https://support.ynab.com/en_us/transfer-transactions-a-guide-HJOsZz4Jj.md)).
- **Banky:** US, CA, UK a vybrané evropské země. Evropa přešla z TrueLayer na Plaid (vlny od 20. 1. 2025),
  pro UK přes Plaid „no timeline“ ([Direct Import in Europe](https://support.ynab.com/en_us/direct-import-in-the-uk-and-eu-an-overview-Syae1z_A9),
  [My bank isn't listed](https://support.ynab.com/en_us/my-bank-isnt-listed-HJivlLavle.md)). Ruční import souborů ano.
- **Cena:** $14.99/měs., $109/rok, 34 dní zdarma bez karty, ceny v USD. Web, iOS, Android, watchOS ([Pricing](https://ynab.com/pricing)).
- **AI:** oficiální ✘ (existují jen komunitní MCP servery).

#### Copilot Money
- **Dnes:** partner se přihlásí do stejného účtu přes magic link. Každé zařízení má „full control of the account“.
  Doporučení: rozpočty podle osoby přes skupiny kategorií, tagy pro „čí je pohyb“, společný účet přidat jen jednou
  ([Sharing your account with a partner](https://help.copilot.money/en/articles/4523792-sharing-your-account-with-a-partner), aktualizace 1. 9. 2026).
- **Plán:** „Households – Coming soon“, „Have up to 3 people on your account … at no extra cost“, „Invite your partner coming this fall“
  ([Pricing](https://www.copilot.money/pricing), [FAQ](https://www.copilot.money/faq)).
- **Banky:** jen US účty, 16 000+ institucí. **Cena:** $109/rok (~$9/měs.), FAQ uvádí měsíc zdarma.
  iPhone, iPad, Mac, web, Android ✘. **AI:** Copilot Intelligence (kategorizace), Money Assistant (beta).

#### Honeydue
- **Členové:** aplikace pro dva partnery, každý má vlastní účet a propojí se s partnerem. Zdarma ([How it works](https://honeydue.com/how-it-works)).
- **Soukromí:** u každého vlastního účtu „Partner can see“: balances and transactions / balances only / nothing at all.
  Jednotlivý pohyb jde skrýt přes Visibility
  ([How to change what my partner can see](https://support.honeydue.com/en/articles/3283211-how-to-change-what-my-partner-can-see), 2019).
- **Dělení:** sekce Splits a Bills, chat k pohybům ([honeydue.com](https://www.honeydue.com/)). Detaily vyrovnání
  (rovným dílem, %, přesná částka, Venmo/PayPal) jsou **neověřené (jen sekundární zdroj)**.
- **Banky:** „over 20,000 financial institutions across 5 countries“, menu uvádí US, CA, UK, ES, FR. iOS a Android.
- **Stav firmy:** Honeydue koupila Mission Lane ([Fenwick](https://www.fenwick.com/insights/experience/fenwick-represents-honeydue-in-acquisition-by-mission-lane)),
  datum neuvedeno. Recenze 2026 hlásí problémy se synchronizací (**neověřeno**). Help center se zjevně neaktualizuje (články z roku 2019).

#### Quicken Simplifi
- **Členové:** „one additional member“, pozvaný potřebuje jen Quicken ID, nemusí mít předplatné (přihlašuje se přes web).
  Sdílení konkrétních účtů nebo funkcí zatím nejde, je jen plný přístup
  ([Spaces & sharing](https://support.simplifi.quicken.com/en/articles/6443103-how-to-use-spaces-sharing-in-quicken-simplifi), aktualizace 1. 9. 2026).
- **Převody:** „automatically detects transfers between accounts“, převody nejsou ve Spending Plan ani reportech
  ([How do transfers work](https://support.simplifi.quicken.com/en/articles/3352152-how-do-transfers-work), úryvek).
- **Banky / trh:** „not designed to function outside the U.S. and Canada“. **Cena:** $3.99/měs. při ročním placení (uvedeno i $6.99).
  Web, iOS, Android ([quicken.com/simplifi](https://www.quicken.com/simplifi)).

#### Rocket Money
- **Členové:** „Account Sharing is designed for two people“, stačí jedno Premium, partner má vlastní login a MFA
  ([Account Sharing](https://help.rocketmoney.com/en/articles/4562634-account-sharing), 22. 9. 2026).
- **Soukromí:** „We do not currently have a feature that would hide specific accounts between Primary and Secondary users.“
  Partner vidí vše kromě Credit Score
  ([Inviting a partner](https://help.rocketmoney.com/en/articles/9184519-inviting-a-partner-to-your-account)).
- Vlastník pohybu, dělení a vyrovnání ✘. Trh US. Web a mobil. Cena Premium je **neověřená** (Rocket Money uvádí variabilní cenu).

#### Lunch Money
- **Členové:** „any number of people on a budget“, platí se za rozpočet, ne za osobu, a předplatné potřebuje jen admin.
  U účtu je vidět „Linked by“ ([Collaborators](https://support.lunchmoney.app/settings/collaborators)).
- **Převody:** obě strany převodu jsou vidět, lze je seskupit (feedback board). **Dělení:** split a skupiny transakcí, vyrovnání ✘.
- **Banky:** Plaid pro US, CA, FR, NL, ES, IE, DE (podle úryvku z [Automatic Imports](https://support.lunchmoney.app/guides/automatic-imports)), jinak CSV a API.
- **Cena:** $10/měs., 30 dní zdarma (úryvek z [Pricing](https://lunchmoney.app/pricing), stránka vrací 403). Webová aplikace.

### Evropa

#### Finanzguru (DE)
- Rodinná nebo partnerská funkce na webu ani v článku „Familien-Haushaltsbuch“ (stav 6. 3. 2026) není.
  Příklad rodiny počítá s tím, že oba rodiče propojí účty do Finanzguru, ale vícečlenný účet nepopisuje
  ([finanzguru.de](https://finanzguru.de/), [Familien Haushaltsbuch App](https://finanzguru.de/finanzwissen/familien-haushaltsbuch-app)).
  Na dělení výdajů je samostatná app „Split by Finanzguru“ (odkaz z webu). Sdílený login jako obvyklé řešení
  potvrzují jen sekundární zdroje.
- **Banky:** „über 4.000 Banken und Anbieter“. **Cena:** zdarma, Plus 0,99 €/týden. **AI:** AI companion odpovídá na dotazy
  nad pohyby a navrhuje úspory. iOS a Android.

#### Wallet by BudgetBakers (CZ)
- **Group Sharing:** vlastník pozve členy (e-mail registrovaný ve Wallet) a každému nastaví oprávnění ke každému účtu:
  **Admin access / Track and read / Read only / No access**. „No access“ účet před členem skryje.
  Premium potřebuje jen vlastník a sdílení jde nastavit jen v mobilní aplikaci, ne na webu
  ([Everything about Group Sharing](https://support.budgetbakers.com/hc/en-us/articles/7149394922002-How-does-group-sharing-work-), úryvky, stránka vrací 403).
  Skupina má až 10 členů a lze sdílet i jen moduly, např. nákupní seznamy
  ([blog 12/2017](https://budgetbakers.com/cs/blog/2017-12-sharing-finances-group-sharing/)). Produktová stránka: Group Sharing je součást Premium,
  účty lze nechat soukromé ([Wallet](https://budgetbakers.com/en/products/wallet/)).
- **Chybí:** vlastník pohybu, pohled za člena (domácnost se nepočítá „za Petra“) a podíly na společném účtu.
- **Převody:** typ Transfer, nepočítá se do příjmů, výdajů ani cash flow. Mezi napojenými účty se řeší automaticky
  ([Exclude from statistics](https://support.budgetbakers.com/hc/en-us/articles/36544649033618-How-to-exclude-an-account-records-or-transfers-from-your-statistics),
  [Bank Parity](https://support.budgetbakers.com/hc/en-us/articles/31001090941970), úryvky).
- **Banky:** „over 15,000 banks worldwide“. Poskytovatelé Salt Edge a Yodlee jsou **neověření (jen sekundární zdroj, europeanpurpose.com)**.
- **AI:** **MCP integrace** (Claude web, desktop i Code, ChatGPT, Cursor, Windsurf), ve výchozím stavu jen čtení, zápis po povolení
  ([MCP](https://budgetbakers.com/en/products/wallet/integrations/mcp/)). REST API.
- **Cena:** Free, Premium a Lifetime. Oficiální ceny jsem nenašel, sekundárně ~€4.49/měs. Web, iOS, Android.

#### Spendee (CZ)
- **Sdílená peněženka:** sdílet jde jen cash peněženku, bankovní ne („Not yet“). Vlastník i hosté můžou upravovat a mazat
  libovolné pohyby, kategorie spravuje vlastník a rozpočty má každý svoje. Plus nebo Premium potřebuje jen vlastník
  ([Shared Wallets](https://help.spendee.com/article/224-shared-wallets), 19. 8. 2026).
- **Převody:** ruční převod mezi peněženkami, nepočítá se do výdajů a příjmů, v cash flow ano. Automatická detekce není popsaná
  ([Transfers](https://help.spendee.com/article/234-transfers)).
- **Banky:** „more than 2500 financial providers worldwide“, jinak import CSV/XLS ([Available banks](https://help.spendee.com/article/149-available-banks)).
  Poskytovatel Salt Edge je **neověřený (jen sekundární zdroj)**.
- **Cena:** Plus $1.99/měs. nebo $14.99/rok, Premium $5.99 nebo $35.99, 7 dní zdarma, ceny se liší podle země
  ([Premium](https://www.spendee.com/premium)). iOS, Android, web. AI: „Magic AI Scan“.

#### Emma (UK)
- **Spaces:** sdílení Space je funkce Ultimate. Sdílený uživatel může upravovat pohyby, ale každý přidává a odebírá jen své účty.
  „Private space“ sdílet nejde ([Share a Space](https://help.emma-app.com/en/article/share-a-space-18a7rpu), 2026).
  Pozvaný bez placeného plánu dostane v daném Space funkce Pro a Plus
  ([What features does the other user get](https://help.emma-app.com/en/article/what-emma-features-does-the-other-user-get-access-to-in-our-space-1rilow3/), 05/03/2026).
- **Emma Family** (17. 9. 2025): až 3 další členové k Ultimate, platí držitel účtu
  ([blog](https://emma-app.com/blog/introducing-emma-family-extra-members-to-your-ultimate-plan)).
- **Vyrovnání:** Groups (karta Pay) dělí výdaje a minimalizuje počet plateb při vyrovnání
  ([How do I settle payments in a group](https://help.emma-app.com/en/article/how-do-i-settle-payments-in-a-group-diaurt/), úryvek).
  Je to spíš Splitwise pro skupiny než model domácnosti.
- **Převody:** pokud jsou oba účty napojené, převod se automaticky vyřadí, nově jako kategorie Transfers
  ([Transfers category](https://help.emma-app.com/en/article/what-is-the-transfers-category-1v3upes/), úryvek).
- **Cena** (**neověřeno, jen sekundární zdroj**): Plus £4.99, Pro £9.99, Ultimate £14.99/měs. Trh hlavně UK. iOS a Android.

#### Moneyhub (UK)
- Spotřebitelská aplikace končí. Nové zákazníky od 2/2025 nepřijímá, pro stávající podle sekundárních zdrojů
  běží do 14. 8. 2026 ([Fintech Futures](https://fintechfutures.com/job-cuts-new-hires/exclusive-moneyhub-shutters-d2c-business-lays-off-around-30-of-uk-workforce),
  [tech.eu 14. 2. 2025](https://tech.eu/2025/02/14/moneyhub-scraps-d2c-app-over-30-jobs-reported-to-be-axed/)). Oficiální oznámení vrací 404.
  Technologii Moneyhubu používá rodinná app Know Your Dosh (UK) s možností soukromých účtů (jen tisková zpráva, **neověřeno**).

#### Outbank (DE)
- Jeden uživatel, data lokálně a šifrovaně („Zero Knowledge“), Secure Sync mezi zařízeními (iPhone, iPad, Mac, Android, Watch).
  Funkce pro více uživatelů nebo rodinu ✘. 4500+ bank a platebních služeb, 14 dní zdarma ([outbankapp.com](https://outbankapp.com/)).
  Cena 3,99 €/měs. nebo 39,99 €/rok je **neověřená (jen sekundární zdroj)**.

#### MoneyMoney (DE)
- Jen macOS, data lokálně na Macu, vlastní FinTS/HBCI, „mehr als 6.500 Banken europaweit“, 79,99 € jednorázově.
  Více uživatelů ani sync ✘, AI ✘ ([moneymoney.app](https://moneymoney.app/)).

### Další relevantní (pro páry)

- **Lumio (UK):** app přímo pro páry. Private Space a Shared Space, sdílení po pohybech, společné účty označené jako joint
  ve sdíleném prostoru, **IOU tracker s poměrem 50/50 nebo 60/40** („who owes who“)
  ([Getting started](https://help.lumio-app.com/en/articles/9203968-getting-started-with-lumio), 21. 9. 2026). Open Banking UK.
  Couples Pro £39.99/rok a partnerství s Lloyds jsou **neověřené (sekundární zdroje)**.
- **N26 Joint Accounts:** od 9. 4. 2024 ve 21 dalších zemích, i v tarifu zdarma. Až 2 lidé, vlastní IBAN, výdaje filtruje podle účastníka
  ([N26 press](https://n26.com/en-eu/press/press-release/n26-launches-joint-accounts-in-21-new-markets-to-enable-customers-to-manage-finances-as-a-couple)).
  Je to konkurence „uvnitř jedné banky“.
- **GoodShare (DE):** sdílená knížka domácnosti pro páry, WG a rodiny, **bez napojení na banku**, Pro 4,99 €/měs.
  Pro platí vlastník knížky ([GoodShare vs Finanzguru](https://goodshare.app/de/blog/goodshare-vs-finanzguru/), vendor).
- **Freenance (PL):** druhý partner má jen čtecí přístup, sdílení po účtech, import MT940/CSV
  ([vendor stránka 5/2026](https://freenance.io/financial-tools/best-finance-app-for-couples-2026-europe-shared-accounts-individual-privacy-budget-cash-flow-iken/)).
- **Balance, Twofold, Halfway, WeBudget:** menší appky pro páry (manuální nebo přes Plaid). Jen záznamy z obchodů a changelogy, nic neověřeno.

## 4. Co se nepodařilo ověřit

- **Monarch:** plné znění help článků (Shared Views, Getting Started, MCP Connector) vrací 403. Vycházím z úryvků ve vyhledávání
  a z oficiálního blogu a stránek Features a Pricing. Cena tieru Plus. Země mimo US/CA.
  Rok ukončení Bill Split (úryvek uvádí jen „June 19th“).
- **Honeydue:** přesné možnosti dělení a vyrovnání (rovným dílem, %, částkou, Venmo/PayPal), aktuální stav vývoje po akvizici Mission Lane
  a datum akvizice.
- **Rocket Money:** aktuální cena Premium. Rozpor mezi help články, zda partnera jde pozvat jen z mobilu.
- **Lunch Money:** oficiální ceník (403), roční cena, role spolupracovníků a možnost skrýt účet.
- **Wallet by BudgetBakers:** oficiální ceny. Aktuální limit členů skupiny (10 je z roku 2017). Poskytovatelé napojení (Salt Edge, Yodlee).
  Zda se převod mezi účty dvou různých členů skupiny páruje.
- **Spendee:** poskytovatel napojení (Salt Edge jen sekundárně), maximální počet členů peněženky.
- **Emma:** oficiální ceník a země mimo UK. Cena Emma Family za člena. AI funkce.
- **Finanzguru:** oficiální help center k více uživatelům (nenalezeno). Rozpoznání převodů mezi vlastními účty.
- **Moneyhub:** oficiální datum ukončení (stránka 404).
- **Outbank:** oficiální ceník (načíst šla jen titulní stránka).
- **Obecně:** u žádné aplikace jsem v dokumentaci nenašel výslovné **párování převodu mezi účty dvou různých členů**,
  ani rozpočítání pohybu **podle držitele karty**.

## 5. Zdroje

Primární (výrobci):
- Monarch: [Shared Views blog (22. 10. 2025)](https://www.monarch.com/blog/shared-views) · [Collaboration](https://www.monarch.com/features/collaboration) · [Pricing](https://www.monarch.com/pricing) · [What's New](https://www.monarch.com/whats-new) · help center (úryvky): [Shared Views](https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch), [Monarch for Couples](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples), [Getting Started](https://help.monarch.com/hc/en-us/articles/360048393272-Getting-Started-with-Monarch), [Hiding an Account](https://help.monarch.com/hc/en-us/articles/4407859794580), [Transfers](https://help.monarch.com/hc/en-us/articles/360048393292), [Budget](https://help.monarch.com/hc/en-us/articles/360048883631-Budget), [Bill Split](https://help.monarch.com/hc/en-us/articles/45825314071060-Bill-Split), [Plus Tier](https://help.monarch.com/hc/en-us/articles/48349699981972-Monarch-Plus-Tier), [MCP Connector](https://help.monarch.com/hc/en-us/articles/50207234679956-Monarch-MCP-Connector), [Connecting Accounts](https://help.monarch.com/hc/en-us/articles/360048393352), [Transaction Rules](https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules)
- YNAB: [YNAB Together](https://www.ynab.com/ynab-together) · [Pricing](https://ynab.com/pricing) · [Direct Import in Europe](https://support.ynab.com/en_us/direct-import-in-the-uk-and-eu-an-overview-Syae1z_A9) · [My bank isn't listed](https://support.ynab.com/en_us/my-bank-isnt-listed-HJivlLavle.md) · [Transfer Transactions](https://support.ynab.com/en_us/transfer-transactions-a-guide-HJOsZz4Jj.md) · [Splitwise and YNAB](https://support.ynab.com/en_us/splitwise-and-ynab-a-guide-H1GwOyuCq.md)
- Copilot Money: [Sharing with a partner (1. 9. 2026)](https://help.copilot.money/en/articles/4523792-sharing-your-account-with-a-partner) · [Pricing](https://www.copilot.money/pricing) · [FAQ](https://www.copilot.money/faq)
- Honeydue: [How to change what my partner can see](https://support.honeydue.com/en/articles/3283211-how-to-change-what-my-partner-can-see) · [Will my partner see…](https://support.honeydue.com/en/articles/3179542-will-my-partner-see-my-bank-account-balances-and-transactions) · [How it works](https://honeydue.com/how-it-works) · [honeydue.com](https://www.honeydue.com/) · [Fenwick – akvizice](https://www.fenwick.com/insights/experience/fenwick-represents-honeydue-in-acquisition-by-mission-lane)
- Quicken Simplifi: [Spaces & sharing (1. 9. 2026)](https://support.simplifi.quicken.com/en/articles/6443103-how-to-use-spaces-sharing-in-quicken-simplifi) · [How do transfers work](https://support.simplifi.quicken.com/en/articles/3352152-how-do-transfers-work) · [Simplifi](https://www.quicken.com/simplifi)
- Rocket Money: [Account Sharing (22. 9. 2026)](https://help.rocketmoney.com/en/articles/4562634-account-sharing) · [Inviting a partner](https://help.rocketmoney.com/en/articles/9184519-inviting-a-partner-to-your-account) · [Premium features](https://help.rocketmoney.com/en/articles/2677184-premium-membership-features)
- Lunch Money: [Collaborators](https://support.lunchmoney.app/settings/collaborators) · [Automatic Imports](https://support.lunchmoney.app/guides/automatic-imports) · [Pricing](https://lunchmoney.app/pricing)
- Finanzguru: [finanzguru.de](https://finanzguru.de/) · [Familien Haushaltsbuch App (6. 3. 2026)](https://finanzguru.de/finanzwissen/familien-haushaltsbuch-app)
- Wallet by BudgetBakers: [Group Sharing](https://support.budgetbakers.com/hc/en-us/articles/7149394922002-How-does-group-sharing-work-) · [Blog Group Sharing (10. 12. 2017)](https://budgetbakers.com/cs/blog/2017-12-sharing-finances-group-sharing/) · [Wallet](https://budgetbakers.com/en/products/wallet/) · [MCP](https://budgetbakers.com/en/products/wallet/integrations/mcp/) · [Exclude from statistics](https://support.budgetbakers.com/hc/en-us/articles/36544649033618-How-to-exclude-an-account-records-or-transfers-from-your-statistics) · [Bank Parity](https://support.budgetbakers.com/hc/en-us/articles/31001090941970)
- Spendee: [Shared Wallets (19. 8. 2026)](https://help.spendee.com/article/224-shared-wallets) · [Transfers](https://help.spendee.com/article/234-transfers) · [Available banks](https://help.spendee.com/article/149-available-banks) · [Premium](https://www.spendee.com/premium)
- Emma: [Share a Space](https://help.emma-app.com/en/article/share-a-space-18a7rpu) · [Features in shared Space](https://help.emma-app.com/en/article/what-emma-features-does-the-other-user-get-access-to-in-our-space-1rilow3/) · [Emma Family (17. 9. 2025)](https://emma-app.com/blog/introducing-emma-family-extra-members-to-your-ultimate-plan) · [Groups – settle](https://help.emma-app.com/en/article/how-do-i-settle-payments-in-a-group-diaurt/) · [Transfers category](https://help.emma-app.com/en/article/what-is-the-transfers-category-1v3upes/)
- Outbank: [outbankapp.com](https://outbankapp.com/) · MoneyMoney: [moneymoney.app](https://moneymoney.app/)
- Lumio: [Getting started (21. 9. 2026)](https://help.lumio-app.com/en/articles/9203968-getting-started-with-lumio)
- N26: [Joint Accounts ve 21 zemích (9. 4. 2024)](https://n26.com/en-eu/press/press-release/n26-launches-joint-accounts-in-21-new-markets-to-enable-customers-to-manage-finances-as-a-couple)

Sekundární (jen jako tip nebo kontext):
- Moneyhub: [Fintech Futures](https://fintechfutures.com/job-cuts-new-hires/exclusive-moneyhub-shutters-d2c-business-lays-off-around-30-of-uk-workforce) · [tech.eu (14. 2. 2025)](https://tech.eu/2025/02/14/moneyhub-scraps-d2c-app-over-30-jobs-reported-to-be-axed/) · [Money to the Masses](https://moneytothemasses.com/news/best-moneyhub-alternatives)
- [europeanpurpose.com – Wallet](https://europeanpurpose.com/tool/wallet-by-budgetbakers) (poskytovatelé Salt Edge, Yodlee)
- [GoodShare vs Finanzguru](https://goodshare.app/de/blog/goodshare-vs-finanzguru/) (vendor) · [Freenance – couples Europe](https://freenance.io/financial-tools/best-finance-app-for-couples-2026-europe-shared-accounts-individual-privacy-budget-cash-flow-iken/) (vendor)
- Recenze tvrdící „soukromé účty“ v Monarchu (v rozporu s výrobcem): [Penny Hoarder](https://www.thepennyhoarder.com/budgeting/monarch-money-review/), [NerdWallet](https://www.nerdwallet.com/finance/learn/monarch-money-app-review)
- Ceny Emma, Wallet, Outbank, Lumio, Monarch Plus: [householdmoneysaving.com](https://www.householdmoneysaving.com/emma-app-review/), [finder.com](https://www.finder.com/uk/wallet-budgetbakers-review), [mobiflip / iphone-ticker (Outbank 4.0)](https://www.iphone-ticker.de/banking-app-outbank-4-0-stellt-sich-grundlegend-neu-auf-280793/), [Lumio blog](https://yourmoney.lumio-app.com/?p=3421), [costbench](https://www.costbench.com/software/personal-finance/monarch-money/)

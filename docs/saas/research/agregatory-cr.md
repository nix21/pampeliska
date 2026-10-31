# Rešerše: agregátoři bankovních dat (PSD2 AIS) pro ČR a EU

Stav k 31. 10. 2026 · Podklad pro [03 – Import dat a AI](../03-import-a-ai.md), otázka Q2 (napojení na banky).

Kontext: provozovatel je OSVČ v ČR (později možná s.r.o.), vlastní licenci AISP mít nebude. Beta ≈ 50 domácností
× ~5 účtů ≈ **250 připojených účtů**, denní nebo průběžná synchronizace.

Značení zdrojů: **[P]** = primární zdroj (dokumentace, ceník, podmínky, status page poskytovatele, EUR-Lex, EBA),
**[S]** = sekundární zdroj (tracker, blog, návod třetí strany). Tvrzení jen ze [S] jsou označená
„neověřeno (jen sekundární zdroj)“. Čísla v hranatých závorkách odkazují na seznam zdrojů v kapitole 8.

---

## 1. Shrnutí

1. **Enable Banking pro české uživatele dnes nefunguje vůbec, smlouva na tom nic nemění.** V jejich dokumentaci
   k ČR stojí „Currently, Enable Banking does not provide its services to payment service users residing in the
   Czech Republic“ [1]. V changelogu za duben 2026 dodávají, že v ČR nepůsobí jako AISP. Jejich infrastrukturu
   pro ČR používají jen TPP, kteří mají vlastní licenci a jsou pasportovaní do ČR [2][3]. Bez licence (vlastní
   nebo licence partnera) tedy cesta přes Enable Banking není. Ceník neuveřejňují: cena se odvíjí od počtu
   účtů a plateb za měsíc a každý měsíc se fakturuje minimální částka [4].
2. **Plaid ČR nepokrývá.** Parametr `country_codes` v `/link/token/create` připouští z Evropy 18 zemí
   (GB, ES, NL, FR, IE, DE, IT, PL, DK, NO, SE, EE, LT, LV, PT, BE, AT, FI) a CZ mezi nimi chybí [5]. Pro EU
   nabízí jen tarif Free (sandbox a 200 živých volání na produkt) a „Scale – Custom“ přes obchod [6].
3. **GoCardless Bank Account Data (ex-Nordigen) nové zákazníky nebere. Potvrzuje to ale jen sekundární zdroj.**
   Dokumentace Actual Budget uvádí „From July 2025 onwards, GoCardless has stopped accepting new Bank Account
   Data accounts“ [7]. Oficiální oznámení GoCardless jsem nenašel. Stránka produktu na gocardless.com dnes
   přesměrovává na britskou stránku o open bankingu [8] a vývojářská dokumentace sice dál uvádí pokrytí celého
   EHP, ale o nových zákaznících mlčí [9]. Jako možnost to proto nepočítám.
4. **Ověřené pokrytí českých bank je nejlepší u Tinku.** Jeho veřejná status page pro Czechia hlídá 9 bank: Air
   Bank, ČS, ČSOB, Fio, KB, mBank, Moneta, Raiffeisenbank a UniCredit [10]. Standard plán běží pod licencí Tinku,
   ale zveřejněné ceny platí jen pro stávající zákazníky. Noví jdou přes obchod [11].
5. **Česká cesta bez licence je Finbricks (skupina KB).** Poskytovatelem AIS je přímo Komerční banka (bankovní
   licence) a uživatel s ní uzavře smlouvu v aplikaci partnera, pro něj zdarma [12]. Partner žádnou licenci
   nepotřebuje [13]. Pokrytí podle ABRA Flexi (11/2025): Moneta, ČS, Fio a mBank (u obou jen tuzemské
   transakce), Air Bank, Creditas, RB a KB. ČSOB a UniCredit chybí, protože neposílají unikátní ID transakce.
   ABRA zároveň píše, že podporu Finbricks „dočasně pozastavila“ [14].
6. **finAPI je jediný se zveřejněným ceníkem, který zahrnuje i licenci.** Pro neregulované zákazníky stojí
   Access B2C 60 €/měs. (do 200 uživatelů) a k tomu „PSD2 licence AIS“ 200 €/měs. (do 200 uživatelů), dohromady
   **≈ 260 €/měs. bez DPH**. Jedna země je v ceně, každá další stojí od 20 €/měs. [15]. ČR finAPI pokrývá [16][17],
   seznam bank ale dává jen na vyžádání [17].
7. **Salt Edge (Partner Program) licenci nevyžaduje** a slibuje přes 2 500 bank v EU [18][19]. Konkrétní české
   banky veřejně ověřit nešly. Pro EU-partnery Salt Edge v minulosti používal licenci české **BudgetBakers
   s.r.o.** (aplikace Wallet, AISP pod dohledem ČNB). Ukazují na to podmínky „Digest“ hostované na saltedge.com
   (revize 1/2021) [20][21]. Jaký je stav dnes, je potřeba ověřit.
8. **Regulace:** od 25. 7. 2023 platí čl. 10a RTS (nařízení 2022/2360). Banka vyžaduje SCA při prvním přístupu
   AISP a pak nejpozději po 180 dnech [22]. Bez SCA je dostupný zůstatek a pohyby za posledních 90 dní [22][23].
   Bez přítomnosti uživatele smí AISP přistoupit nejvýš 4× za 24 hodin a limit se počítá na požadavky, ne na
   jednotlivá volání API [24]. Celou historii lze tedy stáhnout jen hned po SCA, potom běží rolovací okno
   90 dní.
9. **Mimo PSD2 je reálná jen Fio API (token).** Token vytvoří majitel účtu ve svém bankovnictví (se SCA), platí
   max. 180 dní a při přihlášení do bankovnictví se umí sám prodloužit. Data starší 90 dní je potřeba odemknout
   na 10 minut. Doporučený interval dotazů je 30 s na token [25]. Fio třetí strany výslovně nezakazuje a
   dokumentace počítá s „napojením účetních programů“ [25]. Jestli sbírání tokenů od cizích uživatelů není
   samo o sobě službou AIS vyžadující licenci, je otázka pro právníka (neověřeno).
10. **Hrubý odhad ceny pro betu:** finAPI ≈ 260 €/měs. (veřejný ceník). Finbricks má koncovou cenu přes ABRA
    199 Kč za první účet a 49 Kč za každý další měsíčně [14], což by u 250 účtů dalo zhruba 20 tis. Kč/měs.
    To je ale maloobchodní cena prodejce, ne B2B cena. Ostatní ceny nezveřejňují.

### Doporučený užší výběr k poptávce

| Pořadí | Poskytovatel | Proč |
|---|---|---|
| 1 | **Finbricks (KB)** | Český, model bez licence (AISP je KB), většina cílových bank, CZK a české podmínky, podpora česky. Rizika: chybí ČSOB a UniCredit, jen CEE, ABRA podporu pozastavila (zjistit proč). |
| 2 | **finAPI** | Veřejný ceník včetně „licence jako služby“, který vychází nízko (≈ 260 €/měs.), ČR + 12 zemí EU pro pozdější expanzi. Rizika: seznam CZ bank jen na vyžádání, provozovatel je německý (BaFin), kvalitu CZ konektorů nelze předem ověřit. |
| 3 | **Tink (Visa)** | Nejlépe ověřené pokrytí 9 CZ bank, licence Tinku, 18 zemí EU. Riziko: obchodní proces a cena pro malého zákazníka nejasné, možná nás nepřijmou. |
| 4 | **Salt Edge – Partner Program** | Bez licence, široké EU pokrytí, možná přes českou licenci BudgetBakers. Rizika: CZ banky neověřené, cena neznámá. BudgetBakers je přímý konkurent (Wallet), takže zjistit, kdo by byl pro naše uživatele AISP. |

Záložně: **Enable Banking**, pokud získá pas pro ČR nebo se najde licencovaný TPP-partner. Dále Neonomics
(12 CZ bank podle jejich stránky, nepodařilo se načíst) a Powens (ČR neověřena).

---

## 2. Tabulka: poskytovatel × české banky (jen AIS)

Legenda: ✔ podporováno (zdroj v poznámce) · ✘ nepodporováno · ? neověřeno · ✔\* technicky ano, ale ne pro
české uživatele bez vlastní licence.

| Poskytovatel | ČS | ČSOB | KB | RB | UniCredit | Moneta | Air Bank | Fio | mBank | Revolut | Partners | Creditas | Zdroj |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tink | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ? | ? | ? | [10] status page 10/2026 [P] |
| Finbricks (KB) | ✔ | ✘ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ jen tuzemské | ✔ jen tuzemské | ? | ? | ✔ | [14] ABRA Flexi 11/2025 [S/partner] |
| Enable Banking | ✔\* | ✔\* | ✔\* | ✔\* | ? | ✘ | ✔\* (od 4/2026) | ✘ | ? | ? | ? | ? | [1][2] [P]. Pro CZ uživatele vše ✘ |
| finAPI | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ČR ano [16][17] [P], banky na vyžádání |
| Salt Edge | ? | ? | ? | ? | ? (2019 ✔) | ? (2019 ✔) | ? | ? | ? | ? | ? | ? | ČR ano jen [S]. Blog 2019 [S] |
| Neonomics | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | „12 CZ bank“ (úryvek jejich stránky) |
| Powens | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ČR jen [S] |
| GoCardless BAD | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | EHP ano [9], ale noví zákazníci ne [7] |
| Klarna (ex-Kosma) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ČR v tiskové zprávě 2021 [S] |
| Token.io | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | zaměřen na PIS, seznam přes `GET /banks` |
| TrueLayer | ✘? | ✘? | ✘? | ✘? | ✘? | ✘? | ✘? | ✘? | ✘? | ? | ✘? | ✘? | ČR v primárních zdrojích nenalezena |
| Yapily | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? | ✘ | ✘ | ČR není v seznamu zemí [26] [P] |
| Mastercard Open Finance (Aiia) | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? | ✘ | ✘ | ČR není v seznamu zemí (7/2024) [27] [P] |
| Plaid | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? | ✘ | ✘ | CZ není v `country_codes` [5] [P] |

Poznámky:
- **Revolut:** u CZ uživatelů jde o Revolut Bank UAB (Litva). Ten má vlastní PSD2 API pro TPP a limit 4 přístupy
  denně uplatňuje na účet, endpoint a souhlas [28]. Agregátoři ho obvykle vedou pod Litvou nebo EU. Pro naše
  kandidáty jsem to neověřil.
- **Partners Banka:** veřejný vývojářský portál ani pokrytí u žádného agregátora jsem nenašel.
- **ČSOB a UniCredit u Finbricks:** důvod („neposkytují unikátní identifikátor transakcí“) uvádí ABRA Flexi
  [14]. Může jít o omezení importu v ABRA, ne nutně celého Finbricks. Poptat.

---

## 3. Tabulka: licenční model, onboarding, cena

| Poskytovatel | Licence pro nás | Onboarding | Cena | Pokrytí EU |
|---|---|---|---|---|
| **Finbricks (KB)** | Licenci nepotřebujeme, AISP vůči uživateli je KB [12][13] | Poptávka → nabídka → smlouva → přístupy do API [13] | Neveřejná. Přes ABRA: 199 Kč první účet, 49 Kč každý další / měs. [14] | CEE (hlavně CZ, SK) [13] |
| **finAPI** | Licence finAPI za příplatek („PSD2 licence AIS“) [15] | Smlouva, sandbox s CZ testovací bankou [29] | **Veřejná:** Access B2C 60 €/měs. do 200 uživatelů + AIS licence 200 €/měs. do 200 uživatelů. Další země od 20 €/měs. [15] | 13 zemí vč. CZ [16] |
| **Tink** | Standard: licence Tinku. Enterprise: Tinku nebo vlastní [11] | Účet a sandbox zdarma, produkce přes obchod [11][30] | Neveřejná. Ceny Standard „jen pro stávající zákazníky“ [11] | 18 zemí (status pages) [10][30] |
| **Salt Edge** | Partner Program bez vlastní licence [18][19] | Pending režim (fake a sandbox banky) → kontrola kolem 2 pracovních dnů → live, smlouva [19] | Neveřejná [S] | „2 500+ bank v EU“ [18] |
| **Enable Banking** | Pro ČR jen s vlastní licencí a pasem do ČR (TSP model) [1][3] | Účet a sandbox zdarma, produkce po smlouvě a KYB. „Restricted“ režim jen pro vlastní propojené účty [4] | Neveřejná, podle objemu, minimální měsíční faktura [4] | 29–30 zemí, ale ne ČR [2][31] |
| **Neonomics** | Licence AISP (Norsko, pas EU). Model pro neregulované neověřen | ? | Podle úspěšných transakcí [32] | Hlavně severské země |
| **Powens** | Neregulovaní používají licenci Powens SAS [33] | Sandbox zdarma [33] | Neveřejná (enterprise) | „12+ zemí EU“, ČR neověřena |
| **TrueLayer** | Neregulovaní musí použít flow TrueLayeru [34] | Console | Neveřejná | ČR nenalezena |
| **Mastercard Open Finance** | Lze pod licencí Mastercardu [35] | Kontaktní formulář | Neveřejná | 19 zemí bez ČR [27] |
| **Yapily** | Yapily Connect (licence FCA a Bank of Lithuania) [36] | Obchod | Neveřejná [36] | 17–19 zemí bez ČR [26] |
| **Plaid** | Vlastní licence Plaidu | Free / Scale (Custom) [6] | EU jen Custom [6] | 18 zemí bez ČR [5] |
| **GoCardless BAD** | Licence GoCardless | Nové účty od 7/2025 nepřijímá [7] [S] | Dříve zdarma / placené ověření [9] | EHP [9] |
| **Klarna (ex-Kosma)** | ? | Enterprise | Neveřejná | 24 zemí vč. CZ (2021) [S] |
| **Token.io** | ? (hlavně PIS) | ? | Neveřejná | ? |

---

## 4. Detail po poskytovatelích

### Finbricks (skupina Komerční banky)
- **Firma:** Finbricks s.r.o., IČO 10669205, dceřiná společnost KB SmartSolutions, s.r.o., skupina KB [13].
  Na webu varují před podvodnou komunikací, která zneužívá jejich jméno [13].
- **Licenční model:** obchodní podmínky služby informování o platebním účtu jasně říkají, že službu poskytuje
  **Komerční banka, a.s.** na základě bankovní licence. Smlouvu uživatel uzavírá „v internetovém rozhraní nebo
  aplikaci poskytovatele … s nímž KB spolupracuje (Partner)“ a služba je pro něj **bezplatná** [12]. Účel
  dalšího zpracování dat určuje Partner, KB ho nestanoví [12]. Pro nás z toho plyne: licenci nepotřebujeme,
  zůstáváme ale správcem osobních údajů (GDPR).
- **Pokrytí:** viz tabulka (ABRA Flexi, 11. 11. 2025) [14]. Web uvádí zaměření na CEE a ruční testování každé
  banky [13].
- **Souhlas:** „Platnost Finbricks tokenu je 180 dní“ [14].
- **Cena:** veřejný ceník není. Pro uživatele ABRA Flexi 199 Kč první účet a 49 Kč každý další měsíčně bez DPH,
  platí se přímo Finbricks [14]. B2B cenu je potřeba poptat.
- **Poznámky:** ABRA Flexi napsala „Podpora Finbricks dočasně pozastavena. Aktuálně není možné garantovat
  bezproblémovou funkčnost“ [14]. Důvod neznám, při poptávce se zeptat. Pro expanzi mimo CEE se nehodí.

### finAPI
- **Firma:** finAPI GmbH (Německo), BaFin: registrovaná AIS (KID) a licencovaná PIS (ZAD) [16]. Akvizice
  společností Yapily byla oznámena v 5/2022 [S]. Jestli byla dokončena, jsem neověřil.
- **Pokrytí:** finAPI Access pokrývá velké banky v Německu, Rakousku, ČR, na Slovensku a v Maďarsku [16].
  Stránka o pokrytí uvádí 13 zemí (AT, BE, CZ, FR, DE, HU, IT, NL, RO, SK, SI, ES, UK) a seznam bank posílá
  obchod na vyžádání [17]. Pro ČR existuje testovací banka v dokumentaci [29].
- **Licenční model:** použití produktů „requires registration and/or authorization“ u evropského dohledu.
  Výjimkou jsou jen vlastní účty. Neregulovaní zákazníci platí navíc „PSD2 licence“ a musí použít web form
  finAPI [15]. Jde tedy o licenci jako službu.
- **Cena (net, bez DPH) [15]:**
  - Access B2C (soukromé účty): do 200 uživatelů 60 €/měs., do 1 000 uživatelů 300 €/měs., od 1 001 uživatelů
    0,30 € za uživatele (při vyšším objemu klesá až na 0,15 €).
  - PSD2 licence AIS: do 200 (uživatelů nebo volání) 200 €/měs., do 300 300 €/měs. … od 901 1 000 €/měs.
  - Add-on International (každá další země): do 200 uživatelů 20 €/měs.
  - Pro betu (≤ 200 uživatelů) tedy **≈ 260 €/měs.**, s jednou další zemí ≈ 280 €/měs.
- **Neověřeno:** frekvence automatické aktualizace (dokumentace zmiňuje jen „background update“ s webhooky
  [16]), hloubka historie, délka souhlasu, jestli je finAPI pasportované do ČR (EBA register).

### Tink (Visa)
- **Pokrytí:** status page tinkczechia.statuspage.io hlídá 9 českých poskytovatelů (Air Bank, ČS, ČSOB, Fio,
  KB, mBank, Moneta, RB, UniCredit), všechny 31. 10. 2026 „Operational“. Poslední incident byl výpadek PIS
  u Air Bank 25. 10. 2026 [10]. Hlavní status page má samostatné stránky pro 17 trhů (AT, Pobaltí, BE, CZ, DK,
  FI, FR, DE, IE, IT, NL, NO, PL, PT, ES, SE, UK) [30].
- **Licence:** Standard plán „uses Tink's license“, Enterprise umožňuje licenci Tinku i vlastní [11].
- **Onboarding a cena:** Standard je samoobslužný, ale stránka s cenami uvádí, že ceny „are applicable
  exclusively to our existing customers“ a noví zájemci mají kontaktovat obchod [11]. FAQ: Enterprise ceny
  na míru, žádné pay-per-use, sandbox zdarma [30].
- **Frekvence:** data se obnovují 4× za 24 hodin [30].
- **Účty:** běžné, spořicí a kreditní karty pro osobní použití [11].
- **Poznámky:** velká firma (Visa), stabilní, ale malého zákazníka nemusí chtít. Zjistit minimální závazek.

### Salt Edge
- **Licenční model:** Partner Program je pro firmy, které „does not need to get a PSD2 Account Information
  Service Provider license“ [19], a slibuje přínosy open bankingu „even without having your own PSD2 licence
  or eIDAS certificates“ [18]. Licenci, certifikáty i onboarding bank zajišťuje Salt Edge a s partnerem uzavře
  smlouvu [18].
- **Kdo je AISP v EU:** Salt Edge Limited má registraci FCA (#822499) [37], ta ale po brexitu v EU neplatí.
  Na saltedge.com jsou hostované podmínky, ve kterých je AISP **BudgetBakers s.r.o.** (IČO 02882957),
  „authorized by CNB … as an account information service provider“. Partner přesměruje uživatele do služby
  „Digest“ a dostává data se souhlasem uživatele (revize 14. 1. 2021) [20]. BudgetBakers v aktuálních
  podmínkách (od 1. 4. 2026) uvádí, že je licencovaný AISP pod dohledem ČNB a jako technického poskytovatele
  používá Salt Edge [21]. Jestli Partner Program v EU dnes běží přes licenci BudgetBakers, nebo přes vlastní
  EU entitu Salt Edge, je neověřeno. Sekundární zdroj zmiňuje „Salt Edge Ireland“ (neověřeno, jen sekundární
  zdroj).
- **Onboarding:** nový partner začne v režimu pending (fake a sandbox banky, limit 1 000 kategorizovaných
  transakcí denně). Pro přechod na live je potřeba podepisování požadavků, 2FA, e-mail pro incidenty a revoke
  při smazání spojení. Kontrola „usually takes two business days“ [19].
- **Souhlas a frekvence:** `max_consent_days` podle banky. Účty a transakce se synchronizují denně
  (`refresh_start_time` podle země). Limit pozadí „4 times in a 24 hour period“. `max_fetch_interval` (dny)
  podle banky [19].
- **Pokrytí CZ:** v roce 2019 integrovali Monetu a UniCredit CZ (blog Salt Edge, neověřeno aktuálně).
  Seznam bank pro ČR veřejně dohledat nešel.
- **Cena:** neveřejná.
- **Poznámka:** BudgetBakers (Wallet) je přímý konkurent Pampelišky. Pokud by byl AISP pro naše uživatele
  on, viděl by souhlas jeho jméno. Poptat.

### Enable Banking
- **Firma:** Enable Banking Oy, registrovaný AISP pod finským FIN-FSA [31].
- **ČR:** „Currently, Enable Banking does not provide its services to payment service users residing in the
  Czech Republic. However, TPPs operating in the Czech Republic can use Enable Banking API for integrating
  towards Czech banks.“ [1] Changelog 4/2026: v ČR nepůsobí jako AISP, jejich infrastruktura „already powers
  several TPPs licensed to operate there“. Přidali Air Bank a Trinity Bank a českou lokalizaci souhlasu [2].
  Moneta a Fio „not yet supported“, ČS bez app-to-app [1].
- **Model pro TPP:** Enable Banking jako Technical Service Provider. Podmínky: platná licence AISP, PISP
  nebo banky, pas v registru EBA pro cílové trhy, vlastní QWAC a QSealC, vlastní podmínky a privacy notice,
  onboarding 3–5 týdnů [3]. **Pro nás bez licence nepoužitelné.**
- **Cena:** „volume based … number of accounts accessed and payments made per month“, minimální měsíční
  faktura, nabídku dává obchod (od 3/2026 nástroj „Get a Quote“) [4][38].
- **Souhlas, frekvence, historie:** `maximum_consent_validity` podle banky, u většiny 180 dní. Od 10/2025 je
  výchozí platnost 180 dní [38]. Mnoho bank omezuje stahování bez uživatele na 4× denně. Většina bank dává
  aspoň rok historie, mnoho jich ale po zhruba hodině od autorizace omezí přístup na 90 dní [4].
- **Shrnutí pro vlastníka:** z jejich dokumentace vyplývá, že pro české uživatele nejde o otázku kontraktu.
  Enable Banking v ČR jako AISP vůči uživatelům nepůsobí. Zeptat se, jestli plánují pas do ČR a kdy, a jestli
  umí doporučit licencovaného TPP-partnera.

### GoCardless Bank Account Data (ex-Nordigen)
- Dokumentace: AIS „available in all European Economic Area countries that are subject to PSD2“, nové účty
  jsou „non-verified“, ověření jen pro platící [9]. Dřívější docs: až 24 měsíců historie, až 90 dní
  přístupu, limit banky až 4 volání denně na účet [9].
- **Noví zákazníci:** podle Actual Budget od 7/2025 nepřijímá [7] (neověřeno, jen sekundární zdroj).
  Oznámení na gocardless.com se týká vypnutí „legacy“ verze 18. 12. 2023 a odkazuje na obchod [8].
- **Závěr:** nepočítat s ním, případně se zeptat obchodu.

### Plaid
- V Evropě 18 zemí bez ČR, v produkci jen země, o které si zákazník požádá [5].
- EU ceník: Free (sandbox a 200 živých volání na produkt) a Scale = Custom [6]. Pro nás nepoužitelný.

### Neonomics
- Licence PI/AISP/PISP od norského Finanstilsynet s pasem do EU [32] [S]. Konzumenti ~180 dní, 4× denně,
  cena podle úspěšných transakcí [32].
- Stránka market coverage podle výpisu vyhledávače uvádí pro ČR 12 bank, samotnou stránku se ale nepodařilo
  načíst (404). Model pro neregulované zákazníky neověřen.

### Powens (ex Budget Insight)
- Neregulovaní zákazníci „rely on Powens' PSD2 and EMI licences“, regulovaní mohou white-label s vlastní
  licencí. Sandbox zdarma, ceny enterprise [33].
- Uvádí 1 800+ bank ve „12+ zemích EU“ [33]. ČR jen v sekundárních srovnáních (neověřeno, jen sekundární zdroj).

### TrueLayer
- Data API: „Non-regulated and agents of TrueLayer customers must use TrueLayer's flow“ [34]. Seznam zemí je
  jen v Console. ČR jsem v primárních zdrojích nenašel. Hlavně UK a západní Evropa.

### Yapily
- Seznam zemí na stránce coverage (17 zemí) ČR neobsahuje [26]. Licence: Yapily Connect Ltd (FCA) a Yapily
  Connect UAB (Bank of Lithuania), ceny na míru [36].

### Mastercard Open Finance Europe (Aiia)
- Lze použít pod licencí Mastercardu („do not need a license as we are already a licensed TPP“) [35].
- Supported providers (aktualizace 1. 7. 2024): 19 zemí, ČR mezi nimi není [27].

### Klarna (ex-Kosma), Token.io
- **Klarna:** značka Kosma zrušena v 2023, platforma běží pod Klarnou [S]. V roce 2021 uváděla ČR mezi trhy
  [S]. Jde o enterprise produkt a o malé zákazníky zřejmě nestojí (neověřeno).
- **Token.io:** hlavně PIS infrastruktura. Pokrytí AIS se zjišťuje voláním `GET /banks` s filtrem země,
  veřejně neuvádí [39]. Nízká relevance.

### Bankovní identita
- Pro AIS není relevantní. Jde o identitu a přihlášení, ne o stahování pohybů (nezkoumáno podrobněji).

### České AIS mimo agregátory a mimo PSD2

- **Fio API (token vlastníka účtu)** [25], dokumentace v1.9 z 16. 10. 2025:
  - token vytváří majitel nebo oprávněná osoba v internetbankingu, se silnou autorizací, jeden token na jeden
    účet, práva „jen sledování“ nebo i příkazy,
  - platnost povinně nejvýš 180 dní. S automatickým prodlužováním se při každém přihlášení do IB nebo
    Smartbankingu prodlouží na 180 dní,
  - data mladší 90 dní bez další autorizace. Starší vyžadují odemknutí v IB na 10 minut,
  - doporučený nejmenší interval dotazu 30 s na token, formáty JSON, XML, OFX, GPC, CSV, MT940 a camt.053.
    Pohyby mají jedinečné `IDpohyb`,
  - rozhraní „může být použito pro napojení účetních programů“. Výslovný zákaz třetích stran v dokumentaci
    není, jen varování chránit token. Používá ho např. Fakturoid [S].
  - **Riziko:** pokud Pampeliška sbírá tokeny od uživatelů a stahuje jim data jako službu, může to být
    „služba informování o platebním účtu“ podle zákona 370/2017 Sb. Neověřeno, konzultovat s právníkem.
- **Creditas:** od roku 2017 nabízí API s klíčem, který klient vygeneruje v IB a předá třetí straně (Lupa.cz
  2017, neověřeno, jen sekundární zdroj). Aktuální stav ověřit.
- **Firemní API (ČS, ČSOB, KB, RB):** pro firemní účty existují vlastní „premium“ nebo „business“ API.
  Pro domácnosti nepoužitelné (neověřeno podrobně).

---

## 5. Pravidla PSD2/RTS pro AIS

| Pravidlo | Obsah | Zdroj |
|---|---|---|
| **SCA při prvním přístupu a pak po 180 dnech** | Čl. 10a RTS (vložen nařízením 2022/2360 z 3. 8. 2022): banka (ASPSP) při přístupu přes AISP **nevyžaduje SCA**, pokud jde o zůstatek nebo transakce za posledních 90 dní. SCA uplatní při prvním přístupu a když od posledního přístupu se SCA uplynulo **více než 180 dní**. Může ji vyžadovat i z objektivně doložených důvodů podezření na podvod. Platí **od 25. 7. 2023**. Přechodné ustanovení: dosavadní 90denní výjimky doběhnou. | [22] |
| **Rozsah dat bez SCA** | Výjimka pokrývá zároveň zůstatek i transakce za 90 dní (ne jen jedno z toho), rozsah se novelou nezměnil (EBA Q&A 2023_6820, 29. 9. 2023). | [23] |
| **4 přístupy za 24 h bez uživatele** | Čl. 36 odst. 5 písm. b) RTS 2018/389: bez aktivního požadavku uživatele nejvýš 4× za 24 hodin, pokud se AISP s bankou se souhlasem uživatele nedohodne na vyšší frekvenci. Podle EBA Q&A 2018_4210 (21. 12. 2018) se počítají **požadavky, ne volání API**. Jeden požadavek může obsahovat zůstatek i transakce. Banky to v praxi uplatňují na účet a souhlas (např. Revolut na účet, endpoint a souhlas [28]). | [24] |
| **Když je uživatel přítomen** | Požadavky s PSU hlavičkami (uživatel online) se do limitu 4× nepočítají. | [4] |
| **ČR** | Licenci nebo registraci AISP („správce informací o platebním účtu“) uděluje ČNB podle zákona 370/2017 Sb., rozhodnutí do 3 měsíců, minimální kapitál zákon nestanoví, povinné pojištění odpovědnosti [S]. Stanovisko ČNB RS2025-28 z 27. 11. 2025 o minimální uživatelské zkušenosti (app-to-app, bez zbytečných kroků) se týká hlavně PIS [S]. | [40][41] |
| **Výhled PSD3/PSR** | Politická dohoda Rady a EP 27. 11. 2025. Mimo jiné **dashboard oprávnění** pro uživatele u banky a seznam zakázaných překážek přístupu. Účinnost odhadem 2027–2028. Co se změní u 180denní SCA, jsem v textu neověřil. | [42] [S] |

**Dopad na Pampelišku:**
- Uživatel musí souhlas obnovit (SCA u banky) nejpozději jednou za 180 dní. Některé banky nebo agregátoři
  můžou mít kratší dobu. Je potřeba UX pro upozornění a obnovu.
- Delší historii (rok a víc) lze stáhnout jen v krátkém okně po SCA, typicky do zhruba hodiny [4]. Pak už
  jen 90 dní. Import historie tedy pustit hned po připojení a navázat na výpisy z importu souborů.
- Synchronizace na pozadí: nejvýš 4× denně na účet. Ruční „obnovit teď“ s přítomným uživatelem se
  nepočítá.
- Investice, hypotéky a spoření mimo platební účty PSD2 nepokrývá. Kreditní karty a spořicí účty jen tam,
  kde je banka vystavuje jako platební účty (Tink Standard je výslovně zahrnuje [11]).

---

## 6. Co poptat (otázky do poptávky)

Úvod poptávky: *„OSVČ v ČR bez licence AISP, aplikace na rodinné finance (B2C). Beta: ~50 domácností,
~100 uživatelů, ~250 připojených účtů, denní synchronizace (max. 4× denně) + ruční obnova. Pak předplatné
a růst, výhledově další země EU.“*

1. **Licence:** Můžeme fungovat bez vlastní licence? Kdo je vůči uživateli AISP (jméno na souhlasu)? Jsme
   agent, partner nebo „data recipient“? Je tento model v ČR schválený nebo oznámený ČNB a pasportovaný
   (záznam v registru EBA)?
2. **Smluvní strana:** Uzavřete smlouvu s OSVČ, nebo jen s právnickou osobou? Jak vypadá KYB a co od nás
   chcete (AML, popis služby, privacy policy, DPA)?
3. **Pokrytí:** přesný seznam podporovaných CZ bank pro AIS (ČS, ČSOB, KB, RB, UniCredit, Moneta, Air Bank,
   Fio, mBank, Revolut, Partners, Creditas). Osobní i podnikatelské účty (OSVČ)? Kreditní karty, spořicí účty,
   účty v cizí měně?
4. **Kvalita dat:** unikátní a stabilní ID transakce (Finbricks/ABRA hlásí problém u ČSOB a UniCredit), stav
   booked/pending, protiúčet, VS/KS/SS, zpráva pro příjemce, kategorie MCC u karet, zůstatek (dostupný a
   účetní).
5. **Historie:** kolik dní zpět při prvním připojení u každé CZ banky? Jak dlouho po SCA je dostupná plná
   historie?
6. **Souhlas:** max. platnost u CZ bank (180 dní?), jak probíhá obnova (redirect, app-to-app), notifikace o
   blížící se expiraci, webhooky.
7. **Frekvence:** kolikrát denně na pozadí, kdo plánuje (vy nebo my), co se počítá do limitu, chování
   při 429.
8. **Cena:** model (za účet nebo uživatele měsíčně, za volání, paušál), **minimální měsíční poplatek**,
   setup fee, cena pro 250 účtů a 100 uživatelů a pak pro 2 500 účtů, závazek a výpovědní lhůta, cena dalších
   zemí EU.
9. **Sandbox:** zdarma? Testovací CZ banky? Lze testovat na vlastních reálných účtech před smlouvou?
10. **SLA a provoz:** dostupnost, status page na banku, hlášení výpadků, podpora (jazyk, doba odezvy).
11. **UI:** vlastní hostovaný souhlas (web form, Connect) v češtině? Lze ho brandovat? Funguje na mobilu
    (app-to-app)?
12. **Data a GDPR:** kde jsou data uložena, jak dlouho je drží agregátor, role správce a zpracovatele, DPA,
    subdodavatelé.
13. **Ukončení:** co se stane s připojeními, když přejdeme jinam (souhlasy jsou vázané na AISP, uživatelé by
    museli znovu udělit souhlas).
14. **Konkrétně Finbricks:** proč ABRA Flexi pozastavila podporu (11/2025)? Plán na ČSOB a UniCredit? B2B
    cena oproti 199 a 49 Kč přes ABRA?
15. **Konkrétně Salt Edge:** kdo je AISP pro EU partnery (Salt Edge EU entita, nebo BudgetBakers s.r.o.)?
16. **Konkrétně finAPI:** počítá se „uživatel“ jako domácnost, nebo osoba? Je ČR ta „jedna země v ceně“?
    Je finAPI pasportované do ČR?
17. **Konkrétně Enable Banking:** plánujete pas do ČR a kdy? Umíte doporučit licencovaného TPP-partnera pro ČR?

---

## 7. Co se nepodařilo ověřit

- **Registr ČNB (JERRS):** seznamy jsou za CAPTCHA [43], automaticky je načíst nešlo. Kdo má v ČR povolení
  nebo registraci AISP, je potřeba ověřit ručně: jerrs.cnb.cz → Přímé vyhledání / Základní seznamy → typ
  „Správce informací o platebním účtu“. Případně registr EBA [44] (země CZ, „Account information service
  providers“ podle čl. 33 PSD2) a pasované cizí AISP (notifikace pro CZ). Z nalezených zdrojů: **BudgetBakers
  s.r.o.** (AISP pod ČNB, podle jejich podmínek [20][21]), **Komerční banka** (AIS na bankovní licenci,
  Finbricks [12]), každá banka může AIS poskytovat na bankovní licenci.
- **GoCardless:** oficiální potvrzení ukončení nových registrací (jen Actual Budget [7]).
- **Salt Edge:** aktuální EU licenční entita a seznam CZ bank.
- **finAPI:** seznam CZ bank, frekvence aktualizace, délka souhlasu, pas do ČR.
- **Neonomics:** seznam 12 CZ bank (stránka vrací 404).
- **Powens, Klarna, Token.io, TrueLayer:** pokrytí ČR.
- **Revolut, Partners Banka, Creditas:** pokrytí u jednotlivých agregátorů (kromě Creditas u Finbricks).
- **Enable Banking:** cena (není veřejná) a jestli se chystá pas do ČR.
- **Tink:** cena pro nové zákazníky a minimální objem.
- **PSD3/PSR:** finální text k AIS (180 dní, dashboard) a datum účinnosti.
- **Fio token třetí stranou:** jestli je to v souladu se zákonem o platebním styku (právník).

---

## 8. Zdroje

Datum přístupu u všech: 31. 10. 2026. Datum zdroje, pokud je známé, v závorce.

1. [P] Enable Banking – Open Banking Specifics in the Czech Republic: https://enablebanking.com/docs/markets/cz/
2. [P] Enable Banking Changelog April 2026 (14. 5. 2026): https://enablebanking.com/blog/2026/05/14/enable-banking-changelog-april-2026
3. [P] Enable Banking – Getting Started for TPPs: https://enablebanking.com/docs/tpp/getting-started/
4. [P] Enable Banking – FAQ: https://enablebanking.com/docs/faq/
5. [P] Plaid API – `/link/token/create`, `country_codes`: https://plaid.com/docs/api/link/
6. [P] Plaid – Pricing (EU): https://plaid.com/en-eu/pricing/
7. [S] Actual Budget – GoCardless bank sync: https://actualbudget.org/docs/advanced/bank-sync/gocardless/
8. [P] GoCardless – Bank Account Data legacy wind down: https://gocardless.com/bank-account-data/announcement
9. [P] GoCardless – Bank Account Data docs: https://docs.gocardless.com/docs/bank-account-data, https://docs.gocardless.com/bank-account-data/overview
10. [P] Tink Czechia status page (stav 31. 10. 2026): https://tinkczechia.statuspage.io/
11. [P] Tink – Pricing: https://tink.com/pricing/
12. [P] Finbricks/KB – Obchodní podmínky služby informování o platebním účtu (ver001): https://cdn.finbricks.com/terms/actual/OBCHODNI_PODMINKY_SLUZBY_INFORMOVANI_O_PLATEBNIM_UCTU.pdf
13. [P] Finbricks – web: https://finbricks.com/
14. [S/partner] ABRA Flexi – Online stahování výpisů (Finbricks) (11. 11. 2025): https://intercom.help/podpora-flexi/cs/articles/7470785-online-stahovani-vypisu-finbricks
15. [P] finAPI – Prices: https://www.finapi.io/en/prices/
16. [P] finAPI Access – Public Documentation: https://documentation.finapi.io/access/
17. [P] finAPI – Country coverage: https://www.finapi.io/en/products/country-coverage/
18. [P] Salt Edge – Partner Program: https://www.saltedge.com/partner_program
19. [P] Salt Edge – Partners API v1 docs: https://docs.saltedge.com/partners/v1/
20. [P] BudgetBakers terms of service (Digest), hostováno Salt Edge (rev. 14. 1. 2021): https://www.saltedge.com/pages/budgetbakers_terms_of_service
21. [P] BudgetBakers – AIS Terms Summary (účinné od 1. 4. 2026, podle výpisu vyhledávače): https://budgetbakers.com/en/legal/budgetbakers-ais-terms/
22. [P] Nařízení v přenesené pravomoci (EU) 2022/2360 (3. 8. 2022), text: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2360 (čteno přes https://lawplayer.com/eu/act/32022R2360)
23. [P] EBA Q&A 2023_6820 (29. 9. 2023): https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2023_6820
24. [P] EBA Q&A 2018_4210 (21. 12. 2018, oprava 28. 11. 2019): https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4210; RTS 2018/389: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018R0389
25. [P] Fio banka – API Bankovnictví, verze 1.9 (16. 10. 2025): https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf; přehled: https://www.fio.cz/bankovni-sluzby/api-bankovnictvi
26. [P] Yapily – Coverage: https://www.yapily.com/coverage
27. [P] Mastercard Open Finance Europe – Supported Providers (Aiia Data, 1. 7. 2024): https://developer.mastercard.com/open-finance-europe/documentation/unlicensed/aiia-data/production/supported-providers/
28. [P] Revolut – Usage and limits (Open Banking): https://developer.revolut.com/docs/build-banking-apps/usage-and-limits
29. [P] finAPI – Test bank Czech Republic: https://documentation.finapi.io/access/finapi-test-bank-czech-republic
30. [P] Tink – FAQ: https://tink.com/faq/; Tink status: https://status.tink.com/
31. [P] Enable Banking – web: https://enablebanking.com/
32. [P] Neonomics – Account Data API: https://www.neonomics.io/enterprise/account-data-api; market coverage (404): https://neonomics.io/resources/market-coverage
33. [P] Powens – web (licence a pokrytí): https://www.powens.com/?p=698
34. [P] TrueLayer – Data API basics: https://docs.truelayer.com/docs/data-api-basics
35. [P] Mastercard – Aiia Data FAQ (unlicensed): https://developer.mastercard.com/open-finance-europe/documentation/unlicensed/aiia-data/faq/
36. [P] Yapily – Pricing: https://www.yapily.com/pricing
37. [P] Salt Edge – Terms of Service: https://www.saltedge.com/pages/terms_of_service
38. [P] Enable Banking – Changelog (přehled, mimo jiné 10/2025 výchozí platnost 180 dní, 3/2026 „Get a Quote“): https://enablebanking.com/blog/tag/Changelog
39. [P] Token.io – Data v1 bank selection: https://docs.token.io/products/tpp/data/data-v1/data-v1-bank-selection
40. [S] epravo.cz – Správce informací o platebním účtu dle zákona o platebním styku: https://www.epravo.cz/top/clanky/spravce-informaci-o-platebnim-uctu-dle-zakona-o-platebnim-styku-106781.html
41. [S] epravo.cz – Stanovisko ČNB k minimální uživatelské zkušenosti (22. 1. 2026): https://www.epravo.cz/top/clanky/regulatorni-posun-v-oblasti-platebnich-sluzeb-stanovisko-cnb-k-minimalni-uzivatelske-zkusenosti-meni-podminky-pro-open-banking-120565.html
42. [S] Taylor Wessing – EU lawmakers strike a deal on payments reforms (12/2025): https://www.taylorwessing.com/en/insights-and-events/insights/2025/11/eu-lawmakers-strike-a-deal-on-payments-reforms; Worldline (2026): https://worldline.com/en/home/main-navigation/resources/blogs/2026/the-scope-and-timeline-are-locked-in-for-psd3-and-psr-what-should-psps-know
43. [P] ČNB – JERRS: https://jerrs.cnb.cz/apljerrsdad/JERRS.WEB07.INTRO_PAGE?p_lang=cz
44. [P] EBA – Register of payment and electronic money institutions under PSD2: https://www.eba.europa.eu/risk-and-data-analysis/data/registers/payment-institutions-register

Sekundární zdroje použité jen jako tip: Salt Edge blog 2019 (Moneta, UniCredit CZ), Yapily a finAPI akvizice
(5/2022, https://yapily.com/blog/agrees-to-acquire-finapi), Klarna tisková zpráva 2021
(https://www.klarna.com/international/press/klarna-expands-open-banking-solution-to-8-more-european-markets/),
Lupa.cz 2017 o API Creditas (https://www.lupa.cz/aktuality/creditas-banka-spustila-api-pro-automaticke-zpracovani-dat-z-uctu-je-treti-v-cr/),
MoneyWiz o dočasném směrování Salt Edge přes BudgetBakers (https://help.wiz.money/en/articles/4734300-online-banking-in-eu-post-brexit),
openbankingtracker.com a banq.ai (srovnání pokrytí).

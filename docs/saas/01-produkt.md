# 01 – Produkt a rozsah

Stav: rozpracováno (Q1 čeká na odhad nákladů v 03) · Závisí na: –

## Cíl

Ujasnit, pro koho veřejná Pampeliška je, co nabízí a co do veřejné verze nepatří.

## Dnešní stav

- Aplikace pro jednu domácnost s více členy (účty, pohyby, kategorie, pravidla, rozpočty, pravidelné platby,
  investice, predikce). V menu je hotových všech 16 obrazovek (`ENABLED` v `AppShell.tsx`).
- Silně spoléhá na AI klienta přes MCP (import výpisů, kategorizace, poznámky).
- UI jen česky, souhrny v Kč (kurz ČNB), banky a instituce laděné na český trh.
- Dev funkce: ukázková data (`DemoSeeder`), `/testing/*`.

## Otázky

### Q1 – Cílová skupina
- Varianty: uživatelé s vlastním AI klientem (MCP) · běžné domácnosti bez AI klienta · fáze 1 s AI klientem,
  pak všichni.
- Doporučení: fáze 1 pro uživatele s vlastním AI klientem, před fází 2 doplnit import bez AI klienta.
- **Rozhodnutí:** — odloženo (2026-10-31). Nejdřív spočítat v [03](03-import-a-ai.md): kolik stojí
  rozkategorizovat výpis typické domácnosti, jestli stačí levnější model a jestli uživatel může s AI
  o zpracování výpisů mluvit (chat).
- Odhad hotový (03/Q0, 2026-10-31): vestavěná AI stojí na domácnost řádově jednotky až desítky Kč měsíčně,
  tedy méně než napojení na banky. Cena tedy nebrání nabídnout AI všem bez vlastního AI klienta.

### Q2 – Trh a jazyk
- Varianty: jen Česko a čeština · Česko + Slovensko · připravit i18n hned.
- Doporučení: jen Česko a čeština.
- **Rozhodnutí:** i18n hned (2026-10-31). Jazyky od začátku: čeština, angličtina, němčina, polština,
  španělština, francouzština. Z toho plyne evropský trh, ne jen český (dopady níže). Potvrzeno v Q6
  (2026-10-31): všech šest jazyků už v betě.
- **Revize (2026-11-06):** start v ČR (Q6), proto **do bety čeština a angličtina**. Angličtina je pro
  cizince žijící v ČR a jako základ pro další trh. i18n se dál staví hned, takže další jazyky (de, pl, es,
  fr) půjde přidat s novým trhem bez zásahu do kódu.
- **Revize (2026-11-11): celosvětový trh (Q6), od startu ≈ 15 jazyků** psaných zleva doprava latinkou
  a cyrilicí: angličtina (hlavní), čeština, slovenština, němčina, francouzština, španělština, italština,
  portugalština, polština, nizozemština, švédština, dánština, norština, finština, ukrajinština. Japonština,
  korejština, čínština a jazyky psané zprava doleva (arabština, hebrejština) později podle zájmu: font Manrope
  je nepokrývá a RTL vyžaduje úpravu rozvržení.
  - Překládá AI podle **slovníku pojmů** (domácnost, kategorie, převod, pravidlo…), aby byly výrazy
    v každém jazyce stejné. Rodilé mluvčí nemáme, kvalitě se věří. Chyby hlásí uživatelé formulářem (09).
  - Závazné jsou jen anglické právní texty, ostatní jsou informativní překlad (06/Q3).
  - Důvod: s AI stojí další jazyk skoro nic, podpora jde jen přes formulář (09/Q3) a v menších jazycích je
    levnější reklama a menší konkurence ve vyhledávání (10/Q5).

### Q3 – Co je hlavní hodnota (proč platit)
- Varianty: AI kategorizace a import · rodinný pohled s podíly členů · predikce a rozpočty · investice a čisté jmění.
- **Rozhodnutí:** (2026-10-31) tři pilíře:
  1. **Rodinný pohled** – víc členů, podíly na společných účtech, všechny banky na jednom místě.
  2. **AI třídění bez práce** – import, kategorizace a pravidla bez ručního přepisování.
  3. **Plánování dopředu** – predikce, rozpočty, pravidelné platby.
  Majetek a jmění (investice, čisté jmění) zůstává, ale není hlavní důvod platit.

### Q4 – Které dnešní funkce jdou ven, které ne / až později
- Doporučení: do fáze 1 všechny hotové obrazovky včetně MCP; mimo jen dev funkce (`/testing/*`, ukázková data
  mimo dev). Rozdělení do tarifů až v [07](07-predplatne.md).
- **Rozhodnutí:** podle doporučení (2026-10-31).

### Q5 – Velikost a podoba fáze 1
- Varianty: 5–15 známých · 10–30 přes waitlist · 50+ jako otevřená beta.
- Doporučení: 5–15 známých na 3–6 měsíců.
- **Rozhodnutí:** (2026-10-31) **otevřená beta s volnou registrací do stropu počtu domácností**, aby
  nedegradovala služba. Po vyčerpání stropu se registrace přepne na **waitlist** se vzkazem, že kvůli velkému
  zájmu se další domácnosti zapisují do pořadníku. Cílově 50+ domácností. Tím se mění původní záměr
  „fáze 1 jen na pozvánku“.
- Výši stropu určí kapacita provozu ([08](08-provoz.md)) a náklady na AI ([03](03-import-a-ai.md)); strop
  musí jít měnit bez nasazení. Pouštění lidí z waitlistu řeší [09](09-administrace.md).
- **Změna (2026-11-13): žádný waitlist.** Ani před spuštěním (test poptávky přes waitlist se ruší, 10/Q5),
  ani po naplnění stropu. Aplikace s AI vznikne rychle a „plánujeme alternativu k tomu, co už je na trhu“
  nikoho nezaujme, waitlist by lidi spíš odradil. Beta je rovnou otevřená registrace.
  - **Strop zůstává jen jako interní pojistka:** nastavený vysoko, nepropagovaný. Při zneužití AI nebo
    nečekané zátěži jde registrace zavřít bez nasazení, se vzkazem „zkuste to za pár dní“, bez pořadníku.

### Q6 – Pozicování a cílový trh (USA vs. Evropa)
- Otevřeno 2026-10-31: USA platí víc (~100 USD/rok za Monarch, YNAB, Copilot; Finanzguru Plus 2,99 €/měs.),
  ale vyžadují napojení na banky a mobil a je tam silný Monarch.
- Rešerše konkurence: [research/konkurence-rodinne-funkce.md](research/konkurence-rodinne-funkce.md).
  Kombinaci podílů na společných účtech, rozpočítání podle držitele karty, pohledu a predikce za člena
  a párování převodů mezi členy nemá nikdo. Monarch je nejdál, ale bez skrytí účtů a bez podílů; má
  MCP (10/2026). V Evropě je rodinný pohled slabý, nejblíž je Wallet (BudgetBakers).
- Pracovní pozicování: **rodinné finance pro páry a rodiny s více bankami – moje / tvoje / naše, s férovým
  dělením a AI asistentem**, napojení na banky jako základ.
- Varianty trhu: Evropa (mezera v rodinném pohledu, agregátor pro EU pokryje i ČR) · USA (vyšší ceny,
  Plaid, přímý souboj s Monarchem).
- Doporučení bylo: beta jen pro ČR (+SK) v češtině a angličtině, druhý trh vybrat po betě. Důvody: české banky
  a vlastní síť, levnější start, marketing jen v jedné zemi.
- Původní rozhodnutí (2026-10-31): rovnou EU, všech šest jazyků v betě. USA ne: napojení na banky nejde
  vyzkoušet na vlastních účtech a je tam přímo Monarch.
- **Rozhodnutí (změna 2026-11-06): start v ČR**, další země EU až s objemem. USA dál ne.
  Důvod: nabídky agregátorů ([research/navratnost-finbricks.md](research/navratnost-finbricks.md)).
  Pro celou EU stojí agregátor ≈ 500–1 000 €/měs., Finbricks pro ČR 10 000 Kč/měs. a bod zvratu je
  ≈ 115 platících. Finbricks ale pokrývá jen střední a východní Evropu (CEE).
  Důsledky:
  - Agregátor pro start: Finbricks ([03/Q2](03-import-a-ai.md)). Napojení stavět přes vlastní rozhraní
    nezávislé na agregátorovi. Pro další země přibude druhý agregátor.
  - Slovensko jen tehdy, když ho Finbricks pokryje. Ověřit.
  - Marketing a podpora nejdřív jen v ČR a česky ([09](09-administrace.md), [10](10-znacka-web.md)).
  - Ceník v Kč ([07](07-predplatne.md)), kurzy ČNB stačí.
  - Jazyky bety: čeština a angličtina (Q2).
- **Rozhodnutí (změna 2026-11-11): celosvětově, bez napojení na banky.** Start bez agregátora (03/Q2):
  výpisy přeposlané e-mailem nebo nahrané v aplikaci, přečte je AI na serveru (03/Q1). Import přes AI
  nezávisí na bance ani zemi, takže důvod omezit se na ČR odpadl. Trh ČR je na tak specifickou aplikaci
  malý (po kategorii se hledá ≈ 840× měsíčně, [research/klicova-slova.md](research/klicova-slova.md)).
  USA už nejsou vyloučené: bez napojení na banky se nesoutěží s Monarchem na jeho hřišti.
  - **Pozicování:** rodinné finance pro páry a rodiny (moje / tvoje / naše, férové dělení), AI, která výpis
    sama zpracuje a doptá se, vlastní AI přes MCP a **bez přihlášení do banky** (data od uživatele, ne
    přístup k účtu). Napojení na banky „připravujeme“, bez data a slibu.
  - Bod zvratu ≈ 30–40 platících, riziko zhruba třetinové proti Finbricks
    ([research/navratnost-bez-agregatora.md](research/navratnost-bez-agregatora.md)).
  - Důsledky: jazyky (Q2), ceny v EUR, USD a Kč a prodej přes merchant of record kvůli DPH ve všech zemích
    (07), závazné anglické podmínky (06), podpora jen formulářem (09), marketing po jazycích (10).

## Otevřené / zjistit venku

- Konkurence v cílových zemích a její ceny (pro 07) – první rešerše hotová, viz Q6.
- Jak dlouho beta poběží a co je podmínka přechodu do fáze 2.

## Dopad na implementaci

- **i18n:** všechny texty webu, hlášky `DomainException`, popisy MCP nástrojů, e-maily, formáty data a čísel
  (dnes `lib/format.ts` – „28. 9.“, ` Kč`, české plurály v `count()`) podle jazyka. Volba jazyka u uživatele.
- **Více měn:** základní měna domácnosti už jde nastavit (`BaseCurrency`), ale kurzy jsou jen z ČNB a souhrny
  počítají v Kč – pro EUR/PLN domácnosti je potřeba jiný zdroj kurzů (např. ECB) a měnově neutrální souhrny.
  Celosvětový start (2026-11-11) to potřebuje hned.
- **Banky a instituce** jen české → bez agregátora stačí volný název banky a výchozí seznam podle země
  (ikona, barva), případně doplněný z výpisů.
- **Země domácnosti** při registraci: určuje výchozí měnu, jazyk, formáty a výchozí kategorie a pravidla
  (11/Q1). Volba hned při registraci.
- **Slovník pojmů pro překlady** a kontrola chybějících klíčů v buildu; AI doplní překlady při každé změně
  textů.
- **Strop registrací** (interní pojistka, 2026-11-13 bez waitlistu): počítadlo domácností, nastavitelný
  strop a vypínač registrace s lokalizovaným vzkazem.
- **Volná registrace hned ve fázi 1** znamená, že před startem bety musí být hotové: registrace a ochrana proti
  zneužití (04, 05), podmínky a GDPR ve všech jazycích (06), provoz s e-maily (08) a kanál podpory (09).

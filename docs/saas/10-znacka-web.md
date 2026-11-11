# 10 – Značka a veřejný web

Stav: neotevřeno · Závisí na: 01

## Cíl

Jak se o Pampelišce lidé dozví a kde se zaregistrují.

## Dnešní stav

- Aplikace běží na vlastní doméně za Caddy; žádná veřejná prezentace.
- Design „Sluneční“ (tokeny v `web/src/styles/tokens.css`).

## Otázky

### Q1 – Název a doména
- Zůstává „Pampeliška“? Volnost názvu (ochranné známky), doména.
- Trh je od 2026-11-11 celosvětový (01/Q6): funguje název s „š“ v ≈ 15 jazycích a v doméně? Jedna
  mezinárodní značka (anglický název, `.app` / `.com`), nebo Pampeliška jen pro ČR?
- Doporučení: —
- **Rozhodnutí:** —

### Q2 – Landing page
- Varianty: součást SPA · samostatný statický web; obsah (funkce, ceník, FAQ, bezpečnost).
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Registrace z webu
- Fáze 1 má volnou registraci do stropu (01/Q5); po naplnění web místo registrace nabídne waitlist se vzkazem
  o velkém zájmu.
- Web ve všech jazycích aplikace.
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – Oddělení aplikace a webu
- Např. `pampeliska.cz` (web) vs. `app.pampeliska.cz` (aplikace).
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – Marketing
- **Změna 2026-11-11: trh je celosvětový** (01/Q6), bez napojení na banky, ≈ 15 jazyků (01/Q2). Plán
  pro ČR níže zůstává jako podklad pro český trh, nový postup je v bloku „Celosvětově“ na konci otázky.
- Původně (2026-11-06): beta startuje v ČR. Kde a jak oslovit první české domácnosti (komunity, obsah,
  výkonnostní reklama), s jakým rozpočtem.
- Přání (2026-11-06): dobře cílená reklama na Instagramu, Facebooku a Googlu.
- Rozpočet z modelu návratnosti ([research/navratnost-finbricks.md](research/navratnost-finbricks.md)):
  platící domácnost z reklamy smí stát ≈ 1 500 Kč vč. DPH. S.r.o. jako neplátce si u Mety a Googlu odvádí
  21 % sama, takže reklama za 10 000 Kč stojí 12 100 Kč.
- Návrh postupu:
  1. **Před betou:** test landing page a waitlistu ve 2 variantách, 2× 5 000 Kč (viz níže). Získá se
     cena prokliku a zápisu a vlastní publikum pro cílení. **Test proběhne před podpisem smlouvy
     s Finbricks** (2026-11-07, 03/Q2; Finbricks je od 2026-11-11 odložený). Prahy pro ceny bez DPH:
     - zápis na waitlist **pod ≈ 100 Kč:** trh ČR stačí, pokračovat s Finbricks;
     - **100–500 Kč:** opakovat test s jiným sdělením nebo publikem, cenu znovu přepočítat;
     - **nad ≈ 500 Kč:** ČR a SR uživí nanejvýš hobby projekt, přehodnotit cenu, napojení na banky (varianta
       bez agregátora s importem souborů) nebo trh.
  2. **Beta (strop 50 domácností):** bez reklamy, stačí waitlist.
  3. **Spuštění placení:** ≈ 10 000 Kč měsíčně bez DPH:
     - **Google Search ≈ 15 % (1 000–1 500 Kč):** lidé, kteří řešení sami hledají – „rodinný rozpočet“,
       „rozpočet domácnosti“, „aplikace na výdaje“ apod. Po kategorii se hledá jen ≈ 840× měsíčně, víc peněz
       Google neunese (2026-11-07, [research/klicova-slova.md](research/klicova-slova.md)).
     - **Instagram a Facebook ≈ 85 %:** zájmy (páry, mladé rodiny, hypotéka, osobní finance), publikum podobné
       lidem z waitlistu a znovu oslovení návštěvníků webu. Aplikaci tohoto typu skoro nikdo nehledá, proto
       poptávku musí vytvořit tahle reklama.
     - **Bez placení:** šablona rozpočtu v Excelu ke stažení (hledá se „rozpočet domácnosti excel“, „tabulka
       výdajů“) a články na „jak ušetřit“ a „rodinný rozpočet“ s nízkou konkurencí.
  4. **Po 6–8 týdnech** vyhodnotit každý kanál zvlášť. Pod 1 500 Kč za platící domácnost navyšovat zhruba
     o polovinu měsíčně, nad 2 500 Kč kanál zastavit.
- Potenciál ČR a SR (2026-11-07): k zisku stačí ≈ 95 platících, na slušný příjem 300–500, z ≈ 4,5 mil.
  domácností v ČR (+ 2 mil. SR). Velikost trhu nebrzdí, rozhoduje cena zákazníka z Mety. Hrubě při prokliku
  ≈ 8 Kč:

  | | Návštěva → registrace | Registrace → platící | Cena platící domácnosti |
  |---|---|---|---|
  | Pesimisticky | 3 % | 15 % | ≈ 1 800 Kč |
  | Střed | 5 % | 25 % | ≈ 640 Kč |
  | Optimisticky | 10 % | 30 % | ≈ 270 Kč |

  Limit 1 500 Kč leží uvnitř rozpětí, rozhodne test. Hlavní konkurence je zdarma: přehledy výdajů
  v bankovnictví (George, KB, Air Bank). Pampeliška se musí odlišit tím, co banky neumí: celá domácnost
  a všechny banky na jednom místě, společné výdaje páru, AI hledající úspory.
- Měření: konverze z registrace na zaplacení až za 2 měsíce trialu, proto průběžně měřit i cenu registrace
  a aktivace (připojená banka).
- Odhad (2026-11-03, [research/marketing-200.md](research/marketing-200.md)): placenou reklamou stojí platící
  domácnost ≈ 140–500 € (i víc), 200 platících tedy 30–100 tis. €. Při ceně 6–8 €/měs. se to vrací roky.
  Zákazníci musí přijít hlavně zadarmo: vlastní síť, komunity, Show HN nebo Product Hunt, adresáře MCP, obsah,
  affiliate.
- Doporučení: před rozpočtem ověřit poptávku landing page ve 2 variantách (s napojením na banky a bez něj)
  a 300–500 € za reklamu na variantu.
- **Celosvětově (2026-11-11):**
  - **Kanály zdarma první:** Show HN, Product Hunt, Reddit (osobní finance, rozpočty, páry), adresáře MCP
    a komunity kolem Claude a ChatGPT („tvoje rodinné finance ve vlastní AI“), vlastní síť.
  - **Web v každém jazyce zvlášť** se šablonou rozpočtu ke stažení a články „jak ušetřit“ / „rodinný
    rozpočet“. V menších jazycích (polština, nizozemština, severské jazyky, čeština…) je ve vyhledávání menší
    konkurence a levnější reklama než v angličtině, kde proklik na „budget app“ stojí jednotky dolarů.
  - **Test landing page anglicky a česky,** obě s reklamou na Metě, 2× ≈ 5 000 Kč. Měří cenu zápisu na
    waitlist a zájem o napojení na banky (tlačítko „chci napojení“). Prahy jako výše: pod ≈ 100 Kč za zápis
    pokračovat a přidat rozpočet, nad ≈ 500 Kč změnit sdělení nebo cílení.
  - **Placená reklama** až po testu a řízená cenou za platící domácnost: limit ≈ 1 300 Kč včetně DPH
    ([research/navratnost-bez-agregatora.md](research/navratnost-bez-agregatora.md)). Přednostně země
    a jazyky, kde test vyjde nejlevněji.
  - **Pozicování:** rodinné finance pro páry a rodiny, AI zpracuje výpis sama, bez přihlášení do banky,
    vlastní AI přes MCP. Napojení na banky „připravujeme“ bez data.
- **Rozhodnutí:** —

## Otevřené / zjistit venku

- Rešerše ochranných známek a dostupnosti domén.
- Hledanost stejných slov na Seznamu (Návrh klíčových slov Sklik).
- Hledanost a cena prokliku v dalších jazycích (Plánovač klíčových slov, stejný postup jako pro ČR).

## Dopad na implementaci

—

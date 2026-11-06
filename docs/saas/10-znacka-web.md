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
- Start v ČR (01/Q6), další země později: funguje název s „š“ i v cizích jazycích? Jedna mezinárodní
  značka, nebo místní názvy?
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
- Beta startuje v ČR (01/Q6, změna 2026-11-06). Kde a jak oslovit první české domácnosti (komunity, obsah,
  výkonnostní reklama), s jakým rozpočtem. Další země až s dalším agregátorem.
- Přání (2026-11-06): dobře cílená reklama na Instagramu, Facebooku a Googlu.
- Rozpočet z modelu návratnosti ([research/navratnost-finbricks.md](research/navratnost-finbricks.md)):
  platící domácnost z reklamy smí stát ≈ 1 500 Kč vč. DPH. S.r.o. jako neplátce si u Mety a Googlu odvádí
  21 % sama, takže reklama za 10 000 Kč stojí 12 100 Kč.
- Návrh postupu:
  1. **Před betou:** test landing page a waitlistu ve 2 variantách, 2× 5 000 Kč (viz níže). Získá se
     cena prokliku a zápisu a vlastní publikum pro cílení.
  2. **Beta (strop 50 domácností):** bez reklamy, stačí waitlist.
  3. **Spuštění placení:** ≈ 10 000 Kč měsíčně bez DPH:
     - **Google Search ≈ 40 %:** lidé, kteří řešení sami hledají, např. „aplikace na rodinné finance“, „rozpočet
       domácnosti“, „společný účet partneři“. Objemy ověřit v Plánovači klíčových slov.
     - **Instagram a Facebook ≈ 60 %:** zájmy (páry, mladé rodiny, hypotéka, osobní finance), publikum podobné
       lidem z waitlistu a znovu oslovení návštěvníků webu.
  4. **Po 6–8 týdnech** vyhodnotit každý kanál zvlášť. Pod 1 500 Kč za platící domácnost navyšovat zhruba
     o polovinu měsíčně, nad 2 500 Kč kanál zastavit.
- Měření: konverze z registrace na zaplacení až za 2 měsíce trialu, proto průběžně měřit i cenu registrace
  a aktivace (připojená banka).
- Odhad (2026-11-03, [research/marketing-200.md](research/marketing-200.md)): placenou reklamou stojí platící
  domácnost ≈ 140–500 € (i víc), 200 platících tedy 30–100 tis. €. Při ceně 6–8 €/měs. se to vrací roky.
  Zákazníci musí přijít hlavně zadarmo: vlastní síť, komunity, Show HN nebo Product Hunt, adresáře MCP, obsah,
  affiliate.
- Doporučení: před rozpočtem ověřit poptávku landing page ve 2 variantách (s napojením na banky a bez něj)
  a 300–500 € za reklamu na variantu.
- **Rozhodnutí:** —

## Otevřené / zjistit venku

- Rešerše ochranných známek a dostupnosti domén.

## Dopad na implementaci

—

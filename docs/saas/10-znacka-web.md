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

### Q5 – Marketing ve více zemích
- Beta startuje v ČR (01/Q6, změna 2026-11-06). Kde a jak oslovit první české domácnosti (komunity, obsah,
  výkonnostní reklama), s jakým rozpočtem. Další země až s dalším agregátorem.
- Rozpočet z modelu návratnosti ([research/navratnost-finbricks.md](research/navratnost-finbricks.md)):
  reklama ≈ 5 000 Kč/měs. jako test, horní hranice ≈ 1 000–1 500 Kč za platící domácnost.
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

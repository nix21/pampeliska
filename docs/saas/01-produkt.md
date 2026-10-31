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

### Q2 – Trh a jazyk
- Varianty: jen Česko a čeština · Česko + Slovensko · připravit i18n hned.
- Doporučení: jen Česko a čeština.
- **Rozhodnutí:** i18n hned (2026-10-31). Jazyky od začátku: čeština, angličtina, němčina, polština,
  španělština, francouzština. Z toho plyne evropský trh, ne jen český (dopady níže).

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
- **Rozhodnutí:** (2026-10-31) **otevřená beta pro 50+ domácností s volnou registrací** (bez pozvánky).
  Tím se mění původní záměr „fáze 1 jen na pozvánku“.

## Otevřené / zjistit venku

- Konkurence v cílových zemích a její ceny (pro 07).
- Jak dlouho beta poběží a co je podmínka přechodu do fáze 2.

## Dopad na implementaci

- **i18n:** všechny texty webu, hlášky `DomainException`, popisy MCP nástrojů, e-maily, formáty data a čísel
  (dnes `lib/format.ts` – „28. 9.“, ` Kč`, české plurály v `count()`) podle jazyka. Volba jazyka u uživatele.
- **Více měn:** základní měna domácnosti už jde nastavit (`BaseCurrency`), ale kurzy jsou jen z ČNB a souhrny
  počítají v Kč – pro EUR/PLN domácnosti je potřeba jiný zdroj kurzů (např. ECB) a měnově neutrální souhrny.
- **Banky a instituce** jen české → seznam institucí podle země.
- **Volná registrace hned ve fázi 1** znamená, že před startem bety musí být hotové: registrace a ochrana proti
  zneužití (04, 05), podmínky a GDPR ve všech jazycích (06), provoz s e-maily (08) a kanál podpory (09).

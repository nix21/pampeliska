# 06 – Právo a GDPR

Stav: neotevřeno · Závisí na: 03, 05

## Cíl

Provozovat aplikaci legálně: ochrana osobních údajů, podmínky, odpovědnost.

## Dnešní stav

- Žádné podmínky ani zásady ochrany údajů; aplikaci používá jen tvoje domácnost.

## Otázky

### Q1 – Kdo je provozovatel a správce údajů
- Varianty: ty jako OSVČ · nová s.r.o. (omezení odpovědnosti).
- Doporučení: —
- **Rozhodnutí:** s.r.o. (2026-10-31): poskytovatele bankovních dat oslovujeme rovnou jako s.r.o., ne jako OSVČ.
  S.r.o. je už založená (2026-11-06) a není plátce DPH (limit 2 mil. Kč obratu za rok). U služeb ze
  zahraničí (reklama, AI, platební brána) je identifikovanou osobou, viz 07/Q5.

### Q2 – Zpracovatelé
- Seznam: hosting VPS, Google (přihlášení), poskytovatel AI (server-side, 03/Q1), e-maily odchozí i příchozí
  (výpisy přeposílané e-mailem), merchant of record (07/Q4).
- Smlouvy o zpracování (DPA), přenos mimo EU.
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Dokumenty
- Obchodní podmínky, zásady ochrany osobních údajů, cookies (jen nezbytné?).
- Musí být hotové před betou (volná registrace, 01/Q5).
- **Rozhodnutí (2026-11-11): závazné je anglické znění**, ostatní jazyky jsou informativní překlad od AI
  (trh je celosvětový, 01/Q6, ≈ 15 jazyků, 01/Q2). Podmínky nákupu a vracení peněz drží merchant of record
  (07/Q4), naše podmínky na ně odkazují. Platí, dokud je provozovatel s.r.o. v ČR: právo ČR, s ohledem na
  povinná spotřebitelská práva země zákazníka (ověřit u právníka).

### Q4 – Práva subjektů údajů
- Export všech dat domácnosti, smazání účtu a domácnosti, lhůty, mazání ze záloh.
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – Údaje třetích osob
- Pohyby obsahují jména a účty protistran – právní titul, minimalizace.
- Doporučení: —
- **Rozhodnutí:** —

### Q6 – Vymezení služby
- Upozornění, že nejde o finanční ani investiční poradenství; odpovědnost za chyby v predikcích a výpočtech.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

- Konzultace s právníkem (podmínky, GDPR, s.r.o. vs. OSVČ).
- Je potřeba posouzení vlivu na ochranu údajů (DPIA)?
- Zvláštní požadavky cílových zemí (spotřebitelské právo, odstoupení od předplatného). Kolik z toho pokryje
  merchant of record.
- Zákazníci mimo EU (USA, UK): stačí GDPR a podmínky v angličtině, nebo něco navíc (např. CCPA)?

## Dopad na implementaci

—

# 04 – Identita a přístup

Stav: neotevřeno · Závisí na: 02

## Cíl

Jak se lidé registrují, přihlašují, zvou do aplikace a do domácnosti, a jak se k datům dostanou MCP klienti.

## Dnešní stav

- Přihlášení jen přes Google (`Auth.cs`), přístup mají e-maily členů domácnosti (`MemberDirectory`).
- V Development `Auth:DevBypass`.
- Role členů `Owner` / `Member`, rozsah přístupu `All` / `OwnAndJoint`, stav `Invited` / `Active`.
- Vlastní OAuth server pro MCP (scope `pampeliska.write` pro zápis), cookie 14 dní se sliding expiration.

## Otázky

### Q1 – Způsoby přihlášení
- Varianty: jen Google · + Apple / Microsoft · e-mail + heslo · magic link · passkeys.
- Doporučení: —
- **Rozhodnutí:** —

### Q2 – Registrace (fáze 1)
- Podle 01/Q5 je fáze 1 otevřená beta s volnou registrací do stropu počtu domácností, pak waitlist.
- Otázky: ověření e-mailu, jazyk volený při registraci.
- Waitlist: co se od čekajícího sbírá (e-mail, jazyk, země?), jak dostane pozvánku a jak dlouho platí.
- Počítá se do stropu domácnost, nebo uživatel? Přizvaný člen existující domácnosti strop asi obchází.
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Pozvánka člena do domácnosti
- Jak se liší od pozvánky do aplikace; počítá se pozvaný člen do limitu fáze 1 / do předplatného?
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – 2FA
- Varianty: nic (spoléhat na poskytovatele identity) · volitelné · povinné u e-mail+hesla.
- Doporučení: —
- **Rozhodnutí:** —

### Q5 – MCP OAuth pro víc tenantů
- Token vázaný na uživatele a domácnost; souhlas s přístupem; odvolání tokenů v nastavení.
- Doporučení: —
- **Rozhodnutí:** —

### Q6 – Role provozovatele
- Admin účet mimo domácnosti; smí vidět data domácností? (souvisí s 05, 06, 09)
- Doporučení: —
- **Rozhodnutí:** —

### Q7 – Odchod a zrušení
- Odchod člena z domácnosti, zrušení účtu, převod vlastnictví domácnosti.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

—

## Dopad na implementaci

—

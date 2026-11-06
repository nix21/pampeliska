# Poptávka: agregátoři bankovních dat

Stav k 31. 10. 2026 · Podklad pro [03/Q2](03-import-a-ai.md) · Podrobnosti v [rešerši](research/agregatory-cr.md).

První oslovení jen zjišťuje, kdo nás vezme a za kolik. Technické otázky (historie, souhlas, frekvence, kvalita
dat) přijdou až s vybranými poskytovateli. Seznam je v rešerši, kap. 6.

| Komu | Jazyk | Kanál |
|---|---|---|
| Finbricks (KB) | čeština | kontaktní formulář na finbricks.com |
| finAPI | angličtina | Contact sales na finapi.io |
| Tink (Visa) | angličtina | Contact sales na tink.com |
| Salt Edge | angličtina | Partner Program na saltedge.com |
| Enable Banking | angličtina | stávající vlákno s podporou |

Kontakty ber jen z oficiálního webu poskytovatele. Finbricks na webu varuje před podvodnými zprávami, které se
vydávají za ně.

---

## Česky (Finbricks)

**Předmět:** Napojení na bankovní účty (AIS) – podmínky a cena

Dobrý den,

připravujeme aplikaci, která sleduje pohyby na účtech členů domácnosti a hledá úspory. Pro napojení na banky
hledáme poskytovatele služby informování o platebním účtu. Vlastní licenci nemáme.

Chtěl bych se zeptat:

1. Můžeme vaši službu využít bez vlastní licence?
2. Máte někde zveřejněný seznam podporovaných bank v ČR, případně v dalších zemích? Nebo mi ho můžete poslat?
3. Jaký je cenový model a minimální měsíční poplatek?

Děkuji.

S pozdravem
[jméno]
[název s.r.o.] · [e-mail] · [telefon]

---

## Anglicky (finAPI, Tink, Salt Edge)

**Subject:** Account information (AIS) access – terms and pricing

Hello,

we're building an app that tracks transactions on the accounts of household members and helps them find
savings. To connect banks, we're looking for an account information (AIS) provider. We are a Czech company
and don't hold our own licence.

Could you tell me:

1. Can we use your service without our own licence?
2. Do you publish a list of supported banks in the Czech Republic and other EU countries, or could you send it
   to me?
3. What is your pricing model and minimum monthly fee?

Thank you.

Best regards,
[name]
[company s.r.o.] · [e-mail] · [phone]

---

## Doplněk do vlákna s Enable Banking

> Thank you. Your Czech market page says you currently don't provide services to users residing in the Czech
> Republic, and only licensed TPPs can use your API for Czech banks. We don't hold a licence. Are you planning
> to serve Czech users, and if so, when? Or could you recommend a licensed partner in the Czech Republic?

---

## Odpovědi

| | Finbricks | finAPI | Tink | Salt Edge | Enable Banking |
|---|---|---|---|---|---|
| Odesláno | ano | ano | ano | ano | ano |
| Odpověď | 11/2026 | – | – | 11/2026 | 11/2026 |
| Bez licence? | | | | ano (Partner Program) | ? (pro uživatele z ČR ověřit) |
| Banky ČR / EU | | | | | „full EU access“ |
| Cenový model | balíček podle počtu volání API | | | licence + setup + údržba + za připojení | licence + 0,5 € za účet a měsíc |
| Minimální poplatek | 10 000 Kč/měs. do 100 tis. volání, pak 30 000 Kč. Vstup 25 000 Kč | | | od 1 000 €/měs. | 900 €/měs. |
| Poznámky | cenu neuvedli | | | samoobslužný program s nižším závazkem „v příštích měsících“ | 3letá zvýhodněná cena pro startupy, neomezené stahování |
| Reakce (11/2026) | dotaz na model bez pevného poplatku → nabídnut startovací balíček | | | odmítnuto, zájem o samoobslužný program | odmítnuto, zájem o model bez pevné licence |

Po odmítnutí nabídli ostatní agregátoři zhruba 500 €/měs. (11/2026).

Výpočet bodu zvratu: [research/ekonomika-napojeni.md](research/ekonomika-napojeni.md). Návratnost
s nabídkou Finbricks: [research/navratnost-finbricks.md](research/navratnost-finbricks.md).

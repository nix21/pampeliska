# Poptávka: agregátoři bankovních dat

Stav k 31. 10. 2026 · Podklad pro [03/Q2](03-import-a-ai.md) · Otázky vychází z [rešerše, kap. 6](research/agregatory-cr.md).

## Jak poslat

| Komu | Jazyk | Kanál | Co navíc |
|---|---|---|---|
| Finbricks (KB) | čeština | kontaktní formulář nebo obchod na finbricks.com | blok „Finbricks“ |
| finAPI | angličtina | Contact sales na finapi.io | blok „finAPI“ |
| Tink (Visa) | angličtina | Contact sales na tink.com (zároveň založit účet v Console kvůli sandboxu) | blok „Tink“ |
| Salt Edge | angličtina | přihláška do Partner Programu na saltedge.com a dotaz obchodu | blok „Salt Edge“ |
| Enable Banking | angličtina | stávající vlákno s podporou | jen krátký doplněk níže |

- Před odesláním doplnit hodnoty v `[hranatých závorkách]`.
- Kontakty brát jen z oficiálního webu poskytovatele. Finbricks na webu varuje před podvodnou komunikací pod jejich jménem.
- Termín bety je jen orientační. Poskytovatelé se na něj budou ptát, a když je blízko, odpovídají rychleji.
- Odpovědi zapsat do tabulky na konci a pak rozhodnout 03/Q2.

---

## Anglická verze (finAPI, Tink, Salt Edge)

**Subject:** AIS for a family-finance app (CZ, unlicensed) – coverage and pricing inquiry

Hello,

I'm building **[Pampeliška]**, a personal-finance web app for couples and families. Members of one household
see their accounts in one place: who owns which account, shared accounts split by share, budgets and
a cash-flow forecast. Today it runs privately for my own household. Transactions are imported manually,
and we now want to connect banks via PSD2 AIS.

About us and the planned volume:

- Operator: sole trader in the Czech Republic (IČO [12345678]); a limited company (s.r.o.) later if needed.
  **We do not hold an AISP licence** and would like to use yours.
- Beta from [Q2 2027]: ~50 households, ~100 users, **~250 connected accounts**. Target in 12–24 months:
  ~1,000 households, ~2,500 accounts. Then a paid subscription.
- Market: Czech Republic first, later other EU countries (e.g. DE, AT, PL, SK).
- We only need **AIS** (accounts, balances, transactions), no payment initiation. Data is used only to show users
  their own finances. No resale, no credit scoring.
- Sync: background refresh within PSD2 limits (up to 4× a day), plus a manual refresh with the user present.

Could you please answer the following?

1. **Licence model.** Can we use your service without our own licence? Who is the AISP towards the end user
   (whose name appears on the consent)? Are we your agent, partner or data recipient? Is the service passported
   to the Czech Republic (EBA register)?
2. **Contracting.** Do you contract with a sole trader, or only with a company? What does your KYB require
   (AML, service description, privacy policy, DPA)?
3. **Czech banks.** Which Czech banks do you support for AIS: Česká spořitelna, ČSOB, Komerční banka,
   Raiffeisenbank, UniCredit, MONETA, Air Bank, Fio, mBank, Revolut, Partners, Creditas? Personal accounts only,
   or also sole-trader accounts? Savings accounts, credit cards, foreign-currency accounts?
4. **Data quality.** Is there a unique, stable transaction ID at every Czech bank? Booked vs. pending status,
   counterparty account, Czech payment symbols (VS/KS/SS), message for the payee, MCC for card payments,
   available and booked balance?
5. **History.** How many days of history do we get at the first connection, per Czech bank? How long after SCA
   is the full history available?
6. **Consent.** Maximum consent validity at Czech banks (180 days?). How does renewal work (redirect,
   app-to-app)? Do you notify before expiry or send webhooks?
7. **Refresh.** How many background refreshes per day? Do you schedule them or do we? What counts towards the
   4-per-day limit, and what happens on rate limiting?
8. **Pricing.** Pricing model (per account, per user, per call, flat), **minimum monthly fee**, setup fee,
   a price for 250 accounts / 100 users and for 2,500 accounts, commitment and notice period, price of
   additional EU countries.
9. **Sandbox.** Is it free? Are there Czech test banks? Can we test on our own real accounts before signing?
10. **Operations.** Availability (SLA), per-bank status page, outage notifications, support language and
    response time.
11. **Consent UI.** Do you host the consent flow in Czech (and DE/PL)? Can it be branded? Does it work on
    mobile, including app-to-app?
12. **Data and GDPR.** Where is data stored, and how long do you keep it? Controller vs. processor roles, DPA,
    sub-processors.
13. **Exit.** What happens to existing connections if we move to another provider? Would users have to give
    consent again?

[blok podle poskytovatele]

Thank you. I'm happy to have a short call if that's easier.

Best regards,
[Václav Nádraský]
[e-mail] · [telefon] · [web]

### Blok „finAPI“

> A few finAPI-specific questions about your public price list: Does a "user" mean one person or one household
> (shared accounts of two people)? Is the Czech Republic the one country included in the price? Does the
> "PSD2 licence AIS" fee cover Czech users, and is finAPI passported to the Czech Republic? Could you send the
> list of supported Czech banks, the background-update frequency and the consent length?

### Blok „Tink“

> Your pricing page says the Standard prices apply only to existing customers. What would a new customer of our
> size pay, and is there a minimum commitment? Does the Standard plan (Tink's licence) cover Czech consumers?

### Blok „Salt Edge“

> Who is the AISP towards EU end users in the Partner Program today: a Salt Edge EU entity or a partner such as
> BudgetBakers s.r.o.? We ask because BudgetBakers (Wallet) runs a competing app, and its name on our users'
> consent screen would be a problem for us. Could you also send the current list of supported Czech banks?

---

## Česká verze (Finbricks)

**Předmět:** Poptávka AIS pro aplikaci na rodinné finance (bez licence)

Dobrý den,

vyvíjím **[Pampelišku]**, webovou aplikaci na rodinné finance pro páry a rodiny. Členové domácnosti v ní vidí
všechny účty na jednom místě: kdo vlastní který účet, podíly na společných účtech, rozpočty a predikci
zůstatků. Teď ji používám jen soukromě pro vlastní domácnost a pohyby nahráváme ručně. Rádi bychom banky
napojili přes PSD2 AIS a váš model, kde AISP je Komerční banka, nám dává největší smysl.

O nás a plánovaném objemu:

- Provozovatel: OSVČ v ČR (IČO [12345678]), podle potřeby později s.r.o. **Licenci AISP nemáme.**
- Beta od [2. čtvrtletí 2027]: zhruba 50 domácností, 100 uživatelů a **250 připojených účtů**. Za 12–24 měsíců
  cílově 1 000 domácností a 2 500 účtů, pak placené předplatné.
- Trh: nejdřív Česko, výhledově další země EU.
- Potřebujeme jen **AIS** (účty, zůstatky, pohyby), iniciaci plateb ne. Data slouží jen k tomu, aby uživatel viděl
  vlastní finance. Neprodáváme je a neděláme z nich scoring.
- Synchronizace: na pozadí v mezích PSD2 (až 4× denně) a ruční obnova, když je uživatel přítomen.

Prosím o odpovědi na tyto otázky:

1. **Licence a smlouva.** Potvrdíte, že licenci nepotřebujeme a AISP vůči uživateli je KB? Uzavíráte smlouvu
   s OSVČ, nebo jen s právnickou osobou? Co od nás potřebujete ke KYB (AML, popis služby, zásady ochrany
   osobních údajů, smlouva o zpracování)?
2. **Pokrytí.** Které banky podporujete: ČS, ČSOB, KB, Raiffeisenbank, UniCredit, MONETA, Air Bank, Fio, mBank,
   Revolut, Partners, Creditas? Plánujete ČSOB a UniCredit a kdy? Jen osobní účty, nebo i účty OSVČ? Spořicí
   účty, kreditní karty, účty v cizí měně? U Fio a mBank uvádí ABRA Flexi jen tuzemské transakce. Platí to
   obecně?
3. **Kvalita dat.** Unikátní a stálé ID transakce u každé banky, stav zaúčtováno/čeká, protiúčet, VS/KS/SS,
   zpráva pro příjemce, MCC u karet, disponibilní a účetní zůstatek?
4. **Historie.** Kolik dní zpět dostaneme při prvním připojení u jednotlivých bank? Jak dlouho po SCA je dostupná
   plná historie?
5. **Souhlas.** Platnost 180 dní u všech bank? Jak probíhá obnova (redirect, app-to-app)? Posíláte upozornění
   před vypršením nebo webhooky?
6. **Frekvence.** Kolikrát denně na pozadí, kdo synchronizaci plánuje (vy nebo my), co se počítá do limitu
   4× denně a co se stane při jeho překročení?
7. **Cena.** Model (za účet, za uživatele, paušál), **minimální měsíční poplatek**, zřizovací poplatek, cena pro
   250 účtů a 100 uživatelů a pro 2 500 účtů, závazek a výpovědní lhůta. Pro srovnání: ABRA Flexi uvádí
   199 Kč za první účet a 49 Kč za každý další měsíčně. Jaká je B2B cena?
8. **Sandbox.** Je zdarma? Jsou k dispozici testovací banky? Jde před podpisem smlouvy otestovat napojení na
   vlastní reálné účty?
9. **Provoz.** Dostupnost (SLA), stav jednotlivých bank, hlášení výpadků, podpora a doba odezvy.
10. **Souhlas v UI.** Hostujete obrazovku souhlasu? Jde ji brandovat? Funguje na mobilu včetně app-to-app?
    Jaké jazyky kromě češtiny podporuje?
11. **Data a GDPR.** Kde jsou data uložená a jak dlouho je držíte, role správce a zpracovatele, smlouva
    o zpracování, subdodavatelé.
12. **Ukončení.** Co se stane s připojeními, když bychom přešli k jinému poskytovateli? Museli by uživatelé
    souhlas udělit znovu?
13. **Mimo ČR.** Pokrýváte i Slovensko nebo jiné země? Jak byste řešili uživatele z jiných zemí EU?
14. **ABRA Flexi.** U ABRA Flexi je podpora Finbricks od 11/2025 „dočasně pozastavená“. Můžete říct proč
    a jestli se to týká i dalších partnerů?

Děkuji. Pokud je to jednodušší, rád se domluvím na krátkém hovoru.

S pozdravem
[Václav Nádraský]
[e-mail] · [telefon] · [web]

---

## Doplněk do vlákna s Enable Banking (angličtina)

> Thank you for the information. Your Czech market page says Enable Banking currently doesn't provide services
> to payment service users residing in the Czech Republic and only licensed TPPs can use your API for Czech banks.
> We don't hold an AISP licence. Two questions: Are you planning to become an AISP for Czech users (passporting),
> and if so, when? And could you recommend a licensed TPP partner in the Czech Republic that we could work with
> on top of your API?

---

## Odpovědi

| | Finbricks | finAPI | Tink | Salt Edge | Enable Banking |
|---|---|---|---|---|---|
| Odesláno | | | | | |
| Odpověď | | | | | |
| AISP na souhlasu | | | | | |
| Smlouva s OSVČ | | | | | |
| CZ banky (z 12) | | | | | |
| ČSOB / UniCredit | | | | | |
| Historie při připojení | | | | | |
| Platnost souhlasu | | | | | |
| Frekvence na pozadí | | | | | |
| Cena: 250 účtů | | | | | |
| Cena: 2 500 účtů | | | | | |
| Minimální poplatek / závazek | | | | | |
| Sandbox / test na vlastních účtech | | | | | |
| Souhlas česky, mobil | | | | | |
| Další země EU | | | | | |
| Poznámky | | | | | |

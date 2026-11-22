# Pohyby z e-mailových notifikací bank

Návrh (2026-11-22). Banky umí poslat e-mail o každém pohybu. Pampeliška bude mít vlastní adresu, poštu přijme
sama na VPS (vlastní SMTP, žádný další poskytovatel), z e-mailu vytěží pohyb přes Claude Haiku 5.5 a zapíše ho jako
**předběžný**. Až přijde výpis, předběžný pohyb se jím nahradí.

Souvislost: `docs/saas/03-import-a-ai.md` Q1 (výpisy e-mailem) – tady je osobní verze bez poskytovatele. Jádro
zpracování nezávisí na tom, jak e-mail dorazil, takže pro SaaS jde později přidat webhook od poskytovatele.

```
banka ──SMTP──► (MX pampeliska.nadrasky.cz) VPS:25 ──► pampeliska-app:2525  SmtpListener
   │                                                        │ RCPT TO známá adresa? jinak 550
   └─ nebo přes Gmail filtr (přeposlání)                    ▼
                                                     InboundEmail (surový MIME v DB) ── 250 OK
                                                            │ fronta (Channel) + dojezd po startu
                                                            ▼
                                       InboundEmailProcessor: DKIM → Haiku → účet → ImportService
                                                            │
                              Pohyb (Suggested, předběžný) ─┴─► výpis později: nahradí předběžný
```

## 1. DNS a server

| Kde | Co |
|---|---|
| Wedos DNS | `MX pampeliska → pampeliska.nadrasky.cz.` priorita 10 (A záznam už existuje) |
| Wedos DNS | `TXT pampeliska → "v=spf1 -all"` – z té subdomény nikdo neodesílá, ztíží podvržení |
| VPS firewall | povolit příchozí `25/tcp` (ufw); ověřit, že hosting příchozí 25 neblokuje (blokuje se obvykle jen odchozí) |
| `deploy/docker-compose.yml` | u `app`: `ports: ["25:2525"]` – kontejner běží jako `app`, port pod 1024 neotevře |

Kořenová doména `nadrasky.cz` MX nemá a zůstane netknutá. Adresa bude `banky-<token>@pampeliska.nadrasky.cz`,
token náhodný (≥ 10 znaků), jde přegenerovat.

**TLS:** STARTTLS s certifikátem, který pro `pampeliska.nadrasky.cz` už spravuje Caddy. Caddy klíče ukládá jen pro
roota, proto je kontejner `certsync` (alpine) každých 6 h kopíruje ze svazku Invoiceru do svazku `mailcerts`; aplikace
soubor při změně načte znovu. Bez certifikátu by banky doručovaly nešifrovaně. Postup nasazení: `docs/vps-setup.md` kap. 7.

**Stav fáze 1 (2026-11-22):** hotový příjem (`Api/Email/SmtpListener.cs`), uložení (`InboundEmailService`), API
`/api/inbound-emails` a obrazovka Přijaté e-maily (seznam, detail, stažení .eml, nahrání .eml, nastavení adresy).
E-maily zůstávají ve stavu Přijato, vytěžení přijde ve fázi 2.

**Stav fáze 2 (2026-11-22):** `InboundEmailProcessor` + `InboundEmailWorker` (fronta hned po příjmu, opakování po 10 min,
max. 5 pokusů). Ověření DKIM (`Integrations/Dkim.cs`, MimeKit + DnsClient), povolení odesílatelé = známé banky
(`KnownBanks`) + vlastní domény (`InboundSender`). Vytažení přes Haiku 5.5 se strukturovaným výstupem
(`Integrations/NotificationExtractor.cs`, klíč `Email:AnthropicApiKey` ← secret `ANTHROPIC_API_KEY`). Účet podle čísla
účtu (i maskovaného), karty (`Account.CardSuffixes`) nebo jediného běžného účtu banky odesílatele. Zápis přes
`ImportService` (`BatchSource.Email`, dávka „Notifikace d. M.“), pohyb `Provisional` + `InboundEmailId`.
Výpisy v příloze se zatím jen poznají (stav Není pohyb), cizí měna skončí chybou a počká na výpis.
Chybí: značka „Předběžný“ v seznamu Pohyby a párování s výpisem (fáze 3).

## 2. Příjem (Pampeliska.Api)

- `SmtpListener : BackgroundService` – knihovna **SmtpServer** (cosullivan), jen příjem, žádné předávání dál
  (open relay nesmí vzniknout). Port z konfigurace `Email__SmtpPort` (2525), vypínač `Email__Enabled`.
- Kontrola už při `RCPT TO`: adresát musí odpovídat tokenu domácnosti, jinak `550`. Tím odpadne skoro všechen spam.
  Limit velikosti (5 MB), limit spojení z jedné IP.
- `DATA` → uložit surový MIME do `InboundEmail` a teprve po uložení odpovědět `250`. Když aplikace neběží (deploy),
  odesílatel doručení opakuje sám (SMTP to dělá několik dní), nic se neztratí.
- Duplicitní doručení stejného `Message-ID` se uloží jen jednou.
- Rozbor MIME přes **MimeKit** (text i HTML → čistý text).

### Model

```
InboundEmail: Id, ReceivedAt, RemoteIp, MailFrom, RcptTo, FromHeader, Subject, MessageId,
              RawMime (bytea), State, DkimDomain?, Error?, ExtractedJson?, BatchId?
InboundEmailState: Received, Imported, NotMovement, Quarantined, NeedsAccount, Failed
InboundSender: Domain (např. "fio.cz"), Name, Enabled   – povolení odesílatelé
Household: EmailIngestToken
Account: CardSuffixes (poslední čtyřčíslí karet k účtu, pro přiřazení plateb kartou),
         StatementCoveredTo? (konec období posledního výpisu)
ImportBatch: PeriodFrom?, PeriodTo? (období výpisu)
Transaction: Provisional (bool), NotInStatement (bool), InboundEmailId?
BatchSource: + Email (notifikace), + EmailStatement (výpis e-mailem)
```

Surový e-mail se po 30 dnech smaže (zůstanou metadata a vytěžený JSON), ať v DB a zálohách neleží zbytečně dlouho.

## 3. Zpracování (Pampeliska.Core, `InboundEmailProcessor`)

1. **Pravost:** platný DKIM podpis (MimeKit `DkimVerifier`, veřejný klíč z DNS) s doménou ze seznamu
   `InboundSender`. Gmail při automatickém přeposlání původní podpis banky zachová, takže to funguje i přes filtr.
   Jinak → `Quarantined`. Karanténa je vidět v aplikaci – tudy se zobrazí i ověřovací kód Gmailu pro přeposílání.
2. **Vytěžení přes Haiku 5.5** (`claude-haiku-5-5`, oficiální NuGet `Anthropic`, strukturovaný výstup
   `OutputConfig.Format = JsonOutputFormat`, effort `low`, bez nástrojů). Vstup: odesílatel, předmět, datum, text.
   Výstup:
   ```json
   { "isMovement": true,
     "movements": [ { "date": "2026-11-22", "time": "14:05", "amount": -349.00, "currency": "CZK",
       "accountHint": "2300123456/2010", "cardSuffix": "1234", "counterparty": "Albert Brno",
       "counterpartyAccount": null, "message": null, "variableSymbol": null,
       "paymentType": "Card", "authorization": true, "balanceAfter": 15230.50 } ] }
   ```
   Jedna notifikace může nést víc pohybů (denní souhrn). Marketing, upozornění na přihlášení apod. →
   `isMovement: false` → `NotMovement`.
3. **Kontrola výstupu v kódu:** částka ≠ 0, datum nejvýš 7 dní před přijetím a ne v budoucnu, známá měna.
   Co neprojde → `Failed` s důvodem.
4. **Účet:** podle `accountHint` (`AccountNumber.Same` s `Account.Iban`), podle `cardSuffix` v `Account.CardSuffixes`,
   nebo jediný účet té banky. Jinak → `NeedsAccount` (uživatel vybere účet, zapamatuje se jako nápověda).
5. **Zápis:** `ImportService.ImportAsync(..., new ImportOptions(BatchSource.Email, ...))`, pohyb `Provisional = true`,
   `RawText` = text notifikace. Jedna otevřená dávka na účet a den („Notifikace 22. 11.“), další e-maily se přidají
   přes `BatchId`. Pravidla, převody a podíly členů se uplatní jako u každého importu, pohyb zůstane `Suggested`.

**Bezpečnost Haiku:** text e-mailu jsou data. Model nemá nástroje, výstup je pevné schéma a kontroluje ho kód, pohyb
jde jen do fronty nepotvrzených. Podvržená instrukce v e-mailu tak nanejvýš vyrobí špatný předběžný pohyb, který
navíc musel projít DKIM.

**Cena:** notifikace ≈ 1 500 vstupních a 300 výstupních tokenů → ≈ 0,0003 $ (≈ 0,01 Kč). Při ~350 pohybech měsíčně
pod 5 Kč za měsíc. Klíč `ANTHROPIC_API_KEY` jako secret v GitHub environment `production`.

### Výpisy e-mailem

Stejná adresa přijímá i měsíční výpisy. Rozliší se podle přílohy:

- **Příloha CSV / OFX / CAMT.053 / GPC** (podle banky) → parser na serveru bez AI, pokud ho pro tu banku máme;
  jinak AI jako u PDF.
- **Příloha PDF** → Haiku 5.5 přečte PDF (dokument jako `document` blok) a vrátí účet, období a pohyby ve stejném
  tvaru jako `import_transactions`. U dlouhých výpisů po stránkách / dávkách, kontrola: součet pohybů =
  konečný − počáteční zůstatek z hlavičky výpisu (když nesedí → `Failed`, nic se nezapíše).
- **Zamčené PDF** heslem → `Failed` s výzvou nahrát odemčený soubor (heslo neukládáme).
- Zápis jde do **jedné dávky** `BatchSource.EmailStatement` s obdobím; dávka čeká na potvrzení jako dnešní import
  přes MCP. Spustí párování s předběžnými pohyby (kap. 4).
- Výpis bez přílohy (jen odkaz do bankovnictví) → `NotMovement` s poznámkou, že ho banka posílá jen odkazem.

## 4. Předběžný pohyb a výpis (hlavní logika)

Notifikace a výpis popisují stejný pohyb jinak: platba kartou je nejdřív blokace a zaúčtuje se o dny později,
u cizí měny se částka může změnit, text protistrany se liší. Dnešní podezřelé duplicity (`DedupWindowDays`) by při
každém importu výpisu poslaly všechny páry do ruční fronty – to nechceme.

V `ImportService` před běžnou deduplikací:

- Pro každou položku výpisu hledat **předběžný** pohyb na stejném účtu: stejná částka v okně ±5 dní, u plateb
  kartou v cizí měně tolerance ±3 % a podobná protistrana (`Text.Similar`).
- Shoda → předběžný pohyb **převezme data z výpisu** (datum zaúčtování, texty, `ExternalId`), ponechá kategorii
  a potvrzení, `Provisional = false`. Nový pohyb nevznikne.
- Logika párování je čistá statická funkce (jako `RuleEngine`) kvůli testům.

### Kdy je pohyb „nepotvrzený výpisem“

Výpisy chodí jednou měsíčně, takže stáří pohybu nic neříká: pohyb z 2. 11. je předběžný až do výpisu za listopad,
klidně 35 dní, a je to v pořádku. Nepotvrzenost se proto posuzuje **podle období výpisu, ne podle stáří**:

- Import výpisu nese **období** (`PeriodFrom`, `PeriodTo`) – z hlavičky výpisu (u výpisu e-mailem ho vytěží AI,
  u MCP volitelný parametr `import_transactions`). Když chybí, bere se od prvního do posledního pohybu výpisu.
- Na účtu se eviduje **pokrytí výpisy** (`Account.StatementCoveredTo` = konec posledního importovaného období).
- Předběžné pohyby **po** konci pokrytí jsou normální stav – žádné upozornění, jen značka „z notifikace“.
- Po importu výpisu se zkontrolují předběžné pohyby **uvnitř** jeho období, které se nespárovaly:
  - s datem nejvýš 5 dní před koncem období (`PeriodTo − 5`) → fronta Ke kategorizaci jako **„Není ve výpisu“**
    (zrušená blokace, vrácená platba, chyba vytěžení). Uživatel ho smaže, nebo ponechá jako skutečný.
  - s datem v posledních 5 dnech období → zatím nic: blokace z 29. 11. se zaúčtuje 2. 12. a objeví se až ve výpisu
    za prosinec. Posoudí se po dalším výpisu (párování proto hledá i předběžné pohyby z konce předchozího období).
- Pohyby z výpisu, ke kterým notifikace nebyla (poplatky, úroky, ztracený e-mail), se založí normálně jako dnes.

Shrnutí stavů pohybu z notifikace: **předběžný** (čeká na výpis) → **potvrzený výpisem** (data z výpisu, značka
zmizí) nebo **není ve výpisu** (k vyřešení). Kategorizace a potvrzení kategorie s tím nesouvisí a jde udělat kdykoli.

## 5. Aplikace (web)

Návrh UI je v prototypu (claude.ai/design → stránka „Pampeliska Notifikace“, obrazovky 12a–c).

- **Menu Třídění → Přijaté e-maily** (odznak = počet k vyřešení), záložky Přijaté e-maily · Nastavení příjmu ·
  Předběžné pohyby.
- **Přijaté e-maily:** seznam vlevo s filtrem Vše / K vyřešení / Zapsané / Není pohyb, detail vpravo (na mobilu
  samostatná stránka). Stavy: Zapsáno, Výpis načten, Vyberte účet, Karanténa, Nepřečteno, Není pohyb. Detail ukáže
  ověření odesílatele, vytažený pohyb, u výpisu souhrn (spárováno / nově / není ve výpisu), ověřovací kód Gmailu
  a sbalitelný text e-mailu. Akce podle stavu: Otevřít pohyb / dávku, Zapsat pohyb (výběr účtu + zapamatovat kartu),
  Zpracovat znovu, Smazat.
- **Nastavení příjmu:** adresa ke zkopírování a vytvoření nové (s potvrzením), povolení odesílatelé (domény
  s přepínačem), přiřazení k účtům (číslo účtu, karty, kdy přišla poslední notifikace), návod včetně filtru v Gmailu,
  přepínače pro výpisy e-mailem.
- **Detail účtu:** pole „Karty (poslední 4 číslice)“.
- Předběžný pohyb má v seznamu pohybů značku (např. Pill „z notifikace“), přehledy ho započítávají normálně.
- Pro vývoj a jako záloha: nahrání `.eml` souboru (`POST /api/inbound-emails`) – projde stejným zpracováním.

## 6. Testy

- Fixtures: anonymizované skutečné notifikace vlastních bank (`tests/.../Fixtures/*.eml`).
- `InboundEmailProcessor` s falešným `INotificationExtractor` (bez volání API) nad InMemory DB: přiřazení účtu,
  karanténa bez DKIM, dávka na den.
- Párování předběžného pohybu s výpisem: blokace → zaúčtování o 3 dny později, cizí měna, pohyb uvnitř období
  bez protějšku („Není ve výpisu“), pohyb z konce období zaúčtovaný až v dalším výpisu, pohyb po konci období.
- Jednorázové ruční ověření extraktoru proti fixtures se skutečným Haiku (není v běžných testech).

## Fáze

1. **Příjem:** DNS, port, `SmtpListener`, `InboundEmail`, seznam přijatých e-mailů v aplikaci. Bez AI – cílem je
   nasbírat skutečné notifikace vlastních bank a ověřit, že chodí.
2. **Vytěžení a zápis:** DKIM, Haiku, přiřazení účtu, předběžné pohyby.
3. **Párování s výpisem** podle období výpisu a stav „Není ve výpisu“ (i pro výpisy importované přes MCP).
4. **Výpisy e-mailem** (CSV/PDF přílohy, kontrola zůstatků).
5. Volitelně: kategorizace Haiku na serveru, kontrola zůstatku z `balanceAfter`, adresa na domácnost a webhook pro SaaS.

## Otevřené otázky

- Které z vlastních bank posílají e-mail o každém pohybu (ne jen push/SMS) a zda umí jen jednu adresu
  (pak přes filtr v Gmailu).
- Neblokuje hosting VPS příchozí port 25?
- Účet a API klíč pro Claude API (zatím Pampeliška AI na serveru nevolá).

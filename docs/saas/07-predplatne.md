# 07 – Předplatné a platby

Stav: neotevřeno · Závisí na: 01, 03

## Cíl

Fáze 2: placené předplatné s prvními dvěma měsíci zdarma.

## Dnešní stav

- Nic; fakturaci OSVČ dnes řeší samostatná aplikace Invoicer.

## Otázky

### Q1 – Ceník
- Varianty: jeden tarif · tarify podle funkcí (AI, MCP, investice) · podle počtu členů/účtů.
- Měsíčně / ročně se slevou.
- Měna ceníku: celosvětový trh (01/Q6, změna 2026-11-11) → EUR, USD a Kč.
- Hodnota pro zákazníka podle 01/Q3: rodinný pohled, AI třídění, plánování dopředu.
- Napojení na banky se zaplatí jen s cenou ≈ 6–8 € měsíčně s DPH (150–200 Kč). Agregátor může účtovat za
  připojený účet, proto zvážit počet účtů v ceně a příplatek za další
  ([research/ekonomika-napojeni.md](research/ekonomika-napojeni.md)).
- Doporučení (2026-11-06, [research/navratnost-finbricks.md](research/navratnost-finbricks.md)): dva tarify
  s napojením na banky, **149 Kč/měs. s vlastní AI (MCP)** a **199 Kč/měs. s vestavěnou AI** (chat
  s limitem). Ročně 1 490 / 1 990 Kč. Do 8 bankovních účtů v ceně. Případně tarif bez napojení zdarma nebo za
  49 Kč jako vstupní. Předplatné prodávat na webu, ne v obchodech s aplikacemi (provize 15 %).
- **Nové doporučení (2026-11-11)** po změně na start bez napojení na banky
  ([research/navratnost-bez-agregatora.md](research/navratnost-bez-agregatora.md)):

  | Tarif | Měsíčně | Ročně | Obsah |
  |---|---|---|---|
  | **Pampeliška** (vlastní AI) | 6 € · 7 $ · 149 Kč | 60 € · 70 $ · 1 490 Kč | celá aplikace, import výpisů bez AI čtení PDF, MCP pro vlastního AI klienta |
  | **Pampeliška + AI** | 9 € · 10 $ · 219 Kč | 90 € · 100 $ · 2 190 Kč | navíc AI čte výpisy, kategorizuje, doptává se, chat s limitem |

  Ceny jsou konečné včetně DPH (tu odvádí merchant of record). Čistě zbyde ≈ 127 Kč na domácnost, bod
  zvratu ≈ 30 platících. Pořád levnější než Lunch Money (≈ 10 $), YNAB a Monarch (14,99 $). Roční platbu
  zvýraznit: pevná část poplatku (0,50 $) se rozpustí.
- Otevřené: v tarifu bez AI dává smysl jen import strukturovaných souborů (CSV, OFX…) nebo přes vlastní AI
  klienta. Ověřit, jestli to pro běžné uživatele nebude moc složité.
- **Rozhodnutí:** —

### Q2 – Zkušební období
- 2 měsíce zdarma: s kartou předem, nebo bez? Platí znovu pro stejnou domácnost / e-mail?
- Doporučení: —
- **Rozhodnutí:** —

### Q3 – Konec trialu a neplacení
- Varianty: jen čtení · omezená verze · zablokování s exportem; jak dlouho držet data.
- Doporučení: —
- **Rozhodnutí:** —

### Q4 – Platební brána
- Varianty: Stripe · GoPay · Comgate · jiná; kartou, převodem, Apple/Google Pay.
- Celosvětový prodej (01/Q6) mění otázku: DPH podle země zákazníka v EU (nad 10 000 € ročně do ostatních
  zemí EU), registrace od prvního prodeje ve Velké Británii, Norsku, Švýcarsku, Austrálii, sales tax v části
  USA. Sama s.r.o. to neutáhne.
- **Rozhodnutí (2026-11-11): merchant of record** (Paddle, Lemon Squeezy apod., ≈ 5 % + 0,50 $). Vůči
  zákazníkovi je prodejcem on, odvádí daně ve všech zemích, vystavuje doklady a řeší vracení peněz.
  S.r.o. prodává jen jemu a může zůstat neplátcem DPH. Konkrétního poskytovatele vybrat podle ceny,
  podpory měn (EUR, USD, Kč) a jestli přijímá českou s.r.o.

### Q5 – Fakturace a DPH
- Doklady za předplatné (Invoicer? brána?), stornování a vracení peněz.
- Stav 2026-11-06: s.r.o. není plátce DPH. Předplatné je tedy bez DPH. U zahraničních služeb (Meta, Google,
  Anthropic, Stripe) je identifikovanou osobou a DPH 21 % si odvádí sama, bez nároku na odpočet. Limit
  2 mil. Kč obratu je zhruba 900 platících domácností. Pak se stane plátcem a z ceny odvede 21 %. OSS řešit
  až s dalším trhem.
- Změna 2026-11-11: s merchant of record (Q4) jsou doklady pro zákazníky i DPH jeho věc. S.r.o. dostává
  výplaty od jednoho odběratele. Fakturace a limit 2 mil. Kč se počítá z těchto výplat; ověřit s účetní,
  jak se výplaty a poplatek merchant of record účtují.
- Doporučení: —
- **Rozhodnutí:** —

### Q6 – Uživatelé z fáze 1
- Zdarma navždy · sleva · stejné podmínky jako noví.
- Fáze 1 je otevřená beta pro 50+ domácností (01/Q5) – jak ohlásit konec bety a přechod na placení.
- Doporučení: —
- **Rozhodnutí:** —

## Otevřené / zjistit venku

- Konzultace s účetní (DPH, výplaty od merchant of record, evidence plateb).
- Srovnání merchant of record: poplatky, měny, výplaty do ČR, přijetí české s.r.o.

## Dopad na implementaci

—

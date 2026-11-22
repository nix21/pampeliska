# Nasazení Pampelišky na VPS (vedle Invoiceru)

Pampeliška běží na stejném VPS jako Invoicer (Solo Ledger) a sdílí s ním Caddy (HTTPS). Základní instalace serveru
(SSH, firewall, Docker, rclone, uživatel `deploy`) je popsaná v repozitáři Invoiceru v `docs/vps-setup.md` – tady jsou
jen kroky navíc.

```
Internet ──443/80──► Caddy (compose invoicer) ──┬─► invoicer app:8080
                                                └─► pampeliska-app:8080 (síť "edge")
                                                         ├── db (PostgreSQL 17, bez veřejného portu)
                                                         └── volume appdata (/data: DataProtection klíče)
backup (cron 2:45) ── pg_dump ──► rclone crypt ──► OneDrive (…/pampeliska/)
GitHub Actions (ručně) ──► self-hosted runner "pampeliska" ──► docker compose up -d --build
```

## 1. Sdílená síť a Caddy (jednou)

```bash
docker network create edge
sudo mkdir -p /opt/caddy/sites && sudo chown deploy:deploy /opt/caddy/sites
```

V repozitáři Invoiceru (`deploy/`) musí být:

- v `Caddyfile` na konci řádek `import /etc/caddy/sites/*.caddy`,
- v `docker-compose.yml` u služby `caddy` volume `/opt/caddy/sites:/etc/caddy/sites:ro` a síť `edge`
  (`networks: [default, edge]`, na konci souboru `networks: { edge: { external: true } }`).

Po nasazení Invoiceru s touto změnou Caddy načítá site bloky z `/opt/caddy/sites/`. Deploy Pampelišky do ní zapíše
`pampeliska.caddy` a zavolá `caddy reload`.

## 2. DNS

| Typ | Název | Hodnota |
|---|---|---|
| A | `pampeliska` | IP adresa VPS |
| AAAA | `pampeliska` | IPv6 VPS (jen pokud funguje) |
| MX | `pampeliska` | `pampeliska.nadrasky.cz.`, priorita 10 – příjem e-mailů z bank (kap. 7) |
| TXT | `pampeliska` | `v=spf1 -all` – z této subdomény se nic neodesílá |

## 3. Google OAuth klient

Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application):

- Authorized JavaScript origins: `https://pampeliska.nadrasky.cz`
- Authorized redirect URIs: `https://pampeliska.nadrasky.cz/signin-google`

Stačí stávající consent screen z Invoiceru (scopes `openid email profile`, stav *In production*).

## 4. GitHub (repozitář `nix21/pampeliska`)

Settings → Environments → **production**:

| Secret | Hodnota |
|---|---|
| `POSTGRES_PASSWORD` | dlouhé náhodné heslo (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | z kroku 3 |
| `BACKUP_TOKEN` | náhodný token (`openssl rand -hex 32`) |

| Variable | Výchozí |
|---|---|
| `DOMAIN` | `pampeliska.nadrasky.cz` |
| `OWNER_EMAILS` | `v.nadrasky@gmail.com` (první vlastník domácnosti) |
| `RCLONE_CONFIG_DIR` | `/opt/invoicer/rclone` (sdílená konfigurace s Invoicerem) |
| `RCLONE_REMOTE` | `onedrive-crypt:pampeliska/` |
| `CADDY_CONTAINER` | `invoicer-caddy-1` |

## 5. Druhý self-hosted runner

Settings → Actions → Runners → *New self-hosted runner* (Linux x64). Na VPS jako `deploy`:

```bash
mkdir -p ~/runner-pampeliska && cd ~/runner-pampeliska
# stáhnout a rozbalit runner podle instrukcí z GitHubu, pak:
./config.sh --url https://github.com/nix21/pampeliska --token <TOKEN> --name vps-pampeliska --labels pampeliska --unattended
sudo ./svc.sh install deploy && sudo ./svc.sh start
```

## 6. Nasazení

GitHub → Actions → **Deploy** → *Run workflow* (větev `main`). Po doběhnutí otevřete `https://pampeliska.nadrasky.cz`,
přihlaste se Googlem (e-mail z `OWNER_EMAILS`) a projděte průvodce prvním spuštěním.

## 7. Příjem e-mailů z bank

Aplikace sama přijímá poštu na adresu `banky-<token>@pampeliska.nadrasky.cz` (návrh: `docs/email-notifikace.md`).
SMTP poslouchá v kontejneru na 2525, compose ho vystaví na portu 25 hostitele. Nic dál nepřeposílá, cizí adresáty odmítne.

1. DNS: záznamy MX a TXT z kap. 2.
2. Port 25 na hostiteli musí být volný a otevřený:
   ```bash
   sudo ss -ltnp | grep ':25 '     # nic nesmí poslouchat (případně vypnout postfix: sudo systemctl disable --now postfix)
   sudo ufw allow 25/tcp
   ```
   Některé hostingy blokují i příchozí port 25 – ověřit z jiného stroje: `nc -vz pampeliska.nadrasky.cz 25` (po nasazení).
3. STARTTLS: služba `certsync` kopíruje certifikát, který pro doménu už spravuje Caddy, ze svazku Invoiceru.
   Ověřit název svazku (`docker volume ls | grep caddy_data`); když není `invoicer_caddy_data`, nastavit proměnnou
   variable `CADDY_DATA_VOLUME` v GitHub environment **production** (deploy workflow ji zapíše do `.env`).
4. Po nasazení: `docker compose logs app | grep -i "e-mail"` má ukázat „Příjem e-mailů běží … (STARTTLS)“.
   Adresu domácnosti ukáže aplikace v **Přijaté e-maily → Nastavení příjmu**.

5. Vytahování pohybů z e-mailů (Claude Haiku): v GitHub environment **production** přidat secret `ANTHROPIC_API_KEY`
   (klíč z console.anthropic.com). Bez něj se e-maily jen ukládají a v aplikaci je u nich upozornění.

Vypnout příjem jde proměnnou `EMAIL_ENABLED=false` v `.env` (port 25 pak zůstane zavřený jen na úrovni aplikace).

## Zálohy a obnova

Zálohovací kontejner je kopie z Invoiceru (`deploy/backup/`), zálohy jdou do podsložky `pampeliska/` stejného
šifrovaného remote. Obnova: `docker compose run --rm backup restore.sh --really [archiv]`.

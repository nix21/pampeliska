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

## Zálohy a obnova

Zálohovací kontejner je kopie z Invoiceru (`deploy/backup/`), zálohy jdou do podsložky `pampeliska/` stejného
šifrovaného remote. Obnova: `docker compose run --rm backup restore.sh --really [archiv]`.

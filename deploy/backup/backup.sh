#!/bin/bash
# Denní záloha: pg_dump + přílohy + DataProtection klíče → šifrovaně na OneDrive (rclone crypt).
# Rotace: denní zálohy 30 dní, měsíční (1. den v měsíci) 12 měsíců.
set -uo pipefail

STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STAMP=$(date +%Y%m%d-%H%M)
WORK=$(mktemp -d)
ARCHIVE="$WORK/pampeliska-$STAMP.tar.gz"
REMOTE="${RCLONE_REMOTE:-onedrive-crypt:}"

report() {
  local ok=$1 size=${2:-null} msg=$3
  [ -z "${BACKUP_TOKEN:-}" ] && return 0
  curl -fsS -X POST "${REPORT_URL:-http://app:8080/internal/backup-report}" \
    -H "Authorization: Bearer $BACKUP_TOKEN" -H "Content-Type: application/json" \
    -d "{\"success\":$ok,\"sizeBytes\":$size,\"message\":\"${msg//\"/\'}\",\"startedAt\":\"$STARTED\"}" >/dev/null \
    || echo "Nepodařilo se nahlásit výsledek zálohy aplikaci"
}

fail() {
  echo "ZÁLOHA SELHALA: $1"
  report false null "$1"
  rm -rf "$WORK"
  exit 1
}

echo "[$(date)] Záloha $STAMP"
pg_dump -Fc -f "$WORK/db.dump" || fail "pg_dump selhal"
# Přílohy a klíče jen pokud existují (na čerstvé instalaci /data/files ještě není)
DATA_DIRS=()
for d in files keys; do [ -d "/data/$d" ] && DATA_DIRS+=("$d"); done
if [ ${#DATA_DIRS[@]} -gt 0 ]; then
  tar -czf "$ARCHIVE" -C "$WORK" db.dump -C /data "${DATA_DIRS[@]}" || fail "tar selhal"
else
  tar -czf "$ARCHIVE" -C "$WORK" db.dump || fail "tar selhal"
fi
SIZE=$(stat -c %s "$ARCHIVE")

rclone copy "$ARCHIVE" "${REMOTE}daily/" --retries 3 || fail "rclone copy selhal"
if [ "$(date +%d)" = "01" ]; then
  rclone copy "$ARCHIVE" "${REMOTE}monthly/" --retries 3 || fail "rclone copy (monthly) selhal"
fi
# Rotace – složky nejdřív zajistit (monthly vzniká až 1. den v měsíci)
rclone mkdir "${REMOTE}daily/" && rclone mkdir "${REMOTE}monthly/"
rclone delete "${REMOTE}daily/" --min-age 30d || echo "Rotace denních záloh selhala"
rclone delete "${REMOTE}monthly/" --min-age 365d || echo "Rotace měsíčních záloh selhala"

rm -rf "$WORK"
echo "[$(date)] Hotovo, $SIZE B"
report true "$SIZE" "pampeliska-$STAMP.tar.gz"

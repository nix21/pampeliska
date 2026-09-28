#!/bin/bash
# Obnova ze zálohy: restore.sh [název-archivu]  (bez parametru poslední denní záloha)
# Spouštět s parametrem --really (aplikaci předtím zastavit):
#   docker compose stop app && docker compose run --rm backup restore.sh --really [archiv] && docker compose start app
set -euo pipefail
REMOTE="${RCLONE_REMOTE:-onedrive-crypt:}"
[ "${1:-}" = "--really" ] || { echo "Obnova přepíše databázi a přílohy. Spusťte s --really."; exit 1; }
shift
NAME=${1:-$(rclone lsf "${REMOTE}daily/" | sort | tail -1)}
WORK=$(mktemp -d)
echo "Obnovuji $NAME"
rclone copy "${REMOTE}daily/$NAME" "$WORK/" || rclone copy "${REMOTE}monthly/$NAME" "$WORK/"
tar -xzf "$WORK/$NAME" -C "$WORK"
pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$WORK/db.dump"
if [ -d "$WORK/files" ]; then rm -rf /data/files && cp -a "$WORK/files" /data/files; fi
if [ -d "$WORK/keys" ]; then rm -rf /data/keys && cp -a "$WORK/keys" /data/keys; fi
chown -R 1654:1654 /data/files /data/keys 2>/dev/null || true
rm -rf "$WORK"
echo "Obnova dokončena – restartujte aplikaci: docker compose restart app"

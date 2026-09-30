#!/bin/bash
# Spouští zálohu podle cronu BACKUP_SCHEDULE (výchozí 2:45 každý den, 15 minut po Invoiceru).
set -euo pipefail
echo "${BACKUP_SCHEDULE:-45 2 * * *} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "Pampeliska backup: plán '${BACKUP_SCHEDULE:-45 2 * * *}', cíl ${RCLONE_REMOTE}"
if [ "${1:-}" = "now" ]; then exec /usr/local/bin/backup.sh; fi
# jiný příkaz (např. restore.sh) spustit přímo
if [ $# -gt 0 ]; then exec "$@"; fi
exec crond -f -l 8

#!/bin/sh
# Daily logical backup: run from cron on the VM, e.g.  0 3 * * * /opt/trekiva-notify/deploy/backup.sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  | gzip > "backups/notify-$(date +%F).sql.gz"
find backups -name 'notify-*.sql.gz' -mtime +14 -delete

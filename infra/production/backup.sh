#!/usr/bin/env bash
# Nightly logical backup of the HarvestSlot database (custom format), kept for 14 days.
# Install on the VPS:
#   crontab -e   →   15 2 * * * /opt/harvestslot/infra/production/backup.sh >> /var/log/harvestslot-backup.log 2>&1
# Copy ./backups off the server as well (e.g. rclone to another provider): a backup on the same
# disk does not survive losing the server.
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env.production
set +a
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f docker-compose.yml --env-file .env.production exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/harvestslot-$stamp.dump"
find ./backups -name 'harvestslot-*.dump' -mtime +14 -delete
echo "$(date -u) backup harvestslot-$stamp.dump OK ($(du -h "./backups/harvestslot-$stamp.dump" | cut -f1))"

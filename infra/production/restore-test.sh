#!/usr/bin/env bash
# Restore drill: loads a backup into a disposable PostgreSQL container and checks it, without
# touching production. Run monthly and after schema changes.
#   ./restore-test.sh backups/harvestslot-20261024T021500Z.dump
set -euo pipefail
dump=${1:?usage: restore-test.sh <backup.dump>}
name="hs-restore-test-$$"
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore postgres:18-bookworm >/dev/null
trap 'docker stop "$name" >/dev/null' EXIT
until docker exec "$name" pg_isready -U postgres -d restore >/dev/null 2>&1; do sleep 1; done
docker cp "$dump" "$name:/tmp/restore.dump"
docker exec "$name" pg_restore -U postgres -d restore --no-owner --exit-on-error /tmp/restore.dump
docker exec "$name" psql -U postgres -d restore -At -c \
  "select 'migrations', count(*) from _prisma_migrations union all select 'bookings', count(*) from bookings union all select 'invoices', count(*) from invoices union all select 'audit_events', count(*) from audit_events;"
echo "Restore drill passed for $dump"

#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$ROOT/backups"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_dump -U studiodesk -d studiodesk > "$ROOT/backups/studiodesk-$STAMP.sql"
find "$ROOT/backups" -type f -name 'studiodesk-*.sql' -mtime +7 -delete
echo "Created $ROOT/backups/studiodesk-$STAMP.sql"

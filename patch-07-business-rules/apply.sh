#!/usr/bin/env bash
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; PROJ="${1:-.}"
mkdir -p "$PROJ/archive"
tar czf "$PROJ/archive/patch-07-backup.tar.gz" -C "$PROJ" docker-compose.yml server/demos/triggerCatalog.js client/src/components/TriggerNotice.jsx
cp -r "$HERE/SQL" "$HERE/server" "$HERE/client" "$PROJ/"
cp "$HERE/docker-compose.yml" "$PROJ/docker-compose.yml"
cat "$HERE/PATCH_NOTES.txt"
echo "Now run: docker compose exec -T mysql sh -c 'mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" theme_park' < SQL/migrations/25_business_rules.sql"
echo "Time zone: run   docker compose up -d   to restart with Chicago time, then check with:"
echo "  docker compose exec -T mysql sh -c 'mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"SELECT NOW(), CURDATE()\"'"

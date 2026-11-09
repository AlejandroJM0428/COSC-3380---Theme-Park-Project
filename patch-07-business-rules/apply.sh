#!/usr/bin/env bash
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; PROJ="${1:-.}"
mkdir -p "$PROJ/archive"
tar czf "$PROJ/archive/patch-07-backup.tar.gz" -C "$PROJ" server/demos/triggerCatalog.js client/src/components/TriggerNotice.jsx
cp -r "$HERE/SQL" "$HERE/server" "$HERE/client" "$PROJ/"
cat "$HERE/PATCH_NOTES.txt"
echo "Now run: docker compose exec -T mysql sh -c 'mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" theme_park' < SQL/migrations/25_business_rules.sql"

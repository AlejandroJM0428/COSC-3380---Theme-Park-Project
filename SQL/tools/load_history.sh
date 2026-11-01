#!/usr/bin/env bash
# Rebuilds the generated history and loads it into the running database. Run from the repo root, on the machine
# where the stack runs (it uses `docker compose exec` like apply-16-on-server.sh).
#   SQL/tools/load_history.sh              regenerate, then load everything
#   SQL/tools/load_history.sh --no-generate   load the files that are already in SQL/
#   SQL/tools/load_history.sh --from 60    resume at history file 60 (after fixing an error in it)
# What it does: SQL/00_clear_data.sql (empties the data tables), 01_park_and_reference.sql, then SQL/history/*.sql in
# name order, then prints row counts. Each history file is one transaction, so a file that fails loads nothing and
# you can fix it and resume with --from. Stops at the first error. REPLACES the park data: take a backup first (backup.sh).
# The data is made up for the demo. AppUser (logins) and MembershipTier are kept.
set -euo pipefail
cd "$(dirname "$0")/../.."
GEN=1; FROM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-generate) GEN=0 ;;
    --from) FROM="${2:?--from needs a file number, e.g. 60}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
mysql_run() { docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 theme_park'; }
now() { date +%s; }
T0=$(now)

if [ "$GEN" = 1 ]; then
  echo "== generating"; python3 SQL/tools/gen_test_data.py | head -1
fi

if [ "$FROM" = 0 ]; then
  echo "== 00_clear_data.sql"; mysql_run < SQL/00_clear_data.sql
  echo "== 01_park_and_reference.sql"; mysql_run < SQL/01_park_and_reference.sql
fi
for f in SQL/history/[0-9][0-9]_*.sql; do
  n=$(basename "$f" | cut -c1-2)
  [ "$n" = 99 ] && continue
  [ $((10#$n)) -lt $((10#$FROM)) ] && continue
  t=$(now); echo "== $(basename "$f")"
  mysql_run < "$f"
  echo "   $(( $(now) - t ))s"
done
echo "== row counts"; mysql_run < SQL/history/99_row_counts.sql
echo "Total $(( $(now) - T0 ))s."
echo "Next: bash apply-logins-on-server.sh (employees come back as ids 1 to 90, so logins must be re-linked), then check the home page notices."

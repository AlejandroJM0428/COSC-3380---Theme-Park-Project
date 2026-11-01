#!/usr/bin/env bash
# Run this ON THE SERVER after the code is pushed to main.
# Replaces the park data with the generated, made-up history (1 Apr 2025 to today), then checks it.
#   ./apply-history-on-server.sh          asks you to type REPLACE before it touches anything
#   ./apply-history-on-server.sh --yes    no question (for a second run or a script)
# What it does, in order:
#   1. pulls origin/main (fast-forward only) so the generator is the committed one
#   2. stops early if AppUser has no Manager or Admin (the decided cancellation requests need one)
#   3. backs up the database to ~/backups/theme_park-<date>.sql.gz and tests the file
#   4. runs SQL/tools/load_history.sh (generates, empties the data tables, loads every file)
#   5. sets Ride.Status from the live maintenance state (a bulk load leaves every ride Open)
#   6. runs SQL/tools/verify_history.sql (read-only) and prints the counts
# AppUser (logins), MembershipTier and promo notices are kept. Everything else in the park data is REPLACED.
# The history depends on the day it is generated, so a run tomorrow gives a slightly different set. All data is made up.
set -euo pipefail
cd "${THEME_PARK_DIR:-$HOME/repo/theme-park}"

YES=0
case "${1:-}" in
  "") ;;
  --yes) YES=1 ;;
  *) echo "unknown option: $1 (only --yes is accepted)" >&2; exit 2 ;;
esac

# Read queries, tab separated. -N drops the header row, -B keeps it.
q()  { docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 -N -B theme_park' 2>/dev/null; }
qh() { docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 -B theme_park' 2>/dev/null; }

command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 is not installed on this machine (the generator needs it)." >&2; exit 1; }
docker compose ps --status running --services 2>/dev/null | grep -qx mysql \
  || { echo "ERROR: the mysql container is not running. Start the stack first (docker compose up -d)." >&2; exit 1; }

echo "== 1. Code"
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git merge --ff-only -q origin/main || { echo "ERROR: cannot fast-forward to origin/main. Fix the clone by hand, then run this again." >&2; exit 1; }
fi
echo "   at $(git rev-parse --short HEAD) (origin/main)"
[ -f SQL/tools/load_history.sh ] || { echo "ERROR: SQL/tools/load_history.sh is missing." >&2; exit 1; }

echo "== 2. Logins"
ADMINS=$(q <<<"SELECT COUNT(*) FROM AppUser WHERE Role IN ('Manager','Admin');")
if [ "${ADMINS:-0}" -lt 1 ]; then
  echo "ERROR: AppUser has no Manager or Admin, so the 33 decided cancellation requests would be skipped." >&2
  echo "       Run:  docker compose exec app npm run seed    then run this script again." >&2
  exit 1
fi
echo "   $ADMINS Manager/Admin login(s) found"

if [ "$YES" != 1 ]; then
  echo
  echo "This REPLACES the park data (tickets, customers, memberships, ride log, maintenance, shifts, and so on)"
  echo "with a freshly generated, made-up history. Logins, price tiers and promo notices are kept."
  printf 'Type REPLACE to go on: '
  read -r ANSWER
  [ "$ANSWER" = "REPLACE" ] || { echo "Stopped. Nothing was changed."; exit 1; }
fi

echo "== 3. Backup"
mkdir -p "$HOME/backups"
BACKUP="$HOME/backups/theme_park-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --default-character-set=utf8mb4 theme_park' 2>/dev/null \
  | gzip > "$BACKUP"
gzip -t "$BACKUP"
BYTES=$(stat -c%s "$BACKUP" 2>/dev/null || stat -f%z "$BACKUP")
[ "$BYTES" -gt 50000 ] || { echo "ERROR: the backup is only $BYTES bytes, which is too small. Nothing was changed." >&2; rm -f "$BACKUP"; exit 1; }
echo "   $BACKUP ($((BYTES / 1024)) KB, gzip test passed)"

echo "== 4. Load the history"
if ! SQL/tools/load_history.sh; then
  echo >&2
  echo "ERROR: the load stopped. The park data may be half loaded." >&2
  echo "  Fix the error, then resume with:   SQL/tools/load_history.sh --no-generate --from NN   (NN = the number of the file that failed)" >&2
  echo "  Or put everything back with:       gunzip -c $BACKUP | docker compose exec -T mysql sh -c 'mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" theme_park'" >&2
  exit 1
fi

echo "== 5. Ride status"
# Status is a stored label that only the maintenance triggers set, so after a bulk load every ride says Open.
# This sets it from the live state (the update trigger on Ride then writes the 'unavailable' notice for a closed ride).
q <<'SQL'
UPDATE Ride SET Status = IF(fn_UnderMaintenance('Ride', RideID, NOW()), 'Maintenance', 'Open') WHERE IsActive = 1;
SQL
echo "   Ride.Status by value:"
q <<<"SELECT CONCAT('   ', Status, ': ', COUNT(*)) FROM Ride WHERE IsActive = 1 GROUP BY Status;"

echo "== 6. Checks"
OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
qh < SQL/tools/verify_history.sql > "$OUT"
BAD=$(awk -F'\t' '$1 == "violations" && $3 != "n" && $3 + 0 != 0' "$OUT" | wc -l | tr -d ' ')
echo "   checks with violations: $BAD (expect 0)"
awk -F'\t' '$1 == "violations" && $3 != "n" && $3 + 0 != 0 { print "   VIOLATION: " $2 ": " $3 }' "$OUT"
echo "   Row counts:"
awk -F'\t' '$1 == "rows" { printf "   %-20s %s\n", $2, $3 }' "$OUT"
echo "   Months covered by the five required reports (months, first, last):"
awk -F'\t' '$1 == "months" { printf "   %-42s %s months, %s to %s\n", $2, $3, $4, $5 }' "$OUT"
echo "   Triggers: $(q <<<"SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();") (expect 32)"
echo "   Notices on the home page:"
q <<<"SELECT CONCAT('   ', Kind, ': ', Title) FROM v_ActiveNotifications;"
echo "   Cancellation requests by status:"
q <<<"SELECT CONCAT('   ', Status, ': ', COUNT(*)) FROM MembershipCancellationRequest GROUP BY Status;"

echo
if [ "$BAD" != 0 ]; then
  echo "STOP: the checks above found violations. Do not deploy. Backup: $BACKUP" >&2
  exit 1
fi
echo "Done. Backup kept at $BACKUP."
echo "Expect about 25,000 tickets, 133,000 ride-log rows, 90 employees, 3,506 customers plus 1,732 dependents, 421 memberships, 40 cancellation requests."
echo "Next: docker compose exec app npm run seed   (ties every login to its employee; a second run adds nothing)"
echo "Then: deploy-now --allow-infra"
echo "Then: open the Triggers tab (32), the five required reports and the home page (sold out, selling fast, and the closed rides)."

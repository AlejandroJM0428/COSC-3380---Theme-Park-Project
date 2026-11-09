#!/usr/bin/env bash
# Quick "does the project run" check. Run it from the project root after the first start:
#   bash scripts/smoke-test.sh              checks tools, .env files, database, data, backend and client build
#   bash scripts/smoke-test.sh --baseline   same checks, then writes docs/baseline.txt (tables, views, triggers, routes)
# Read-only: it never changes the database. Prints PASS / WARN / FAIL for each check and exits 1 if anything FAILs.
# The backend check needs the server running (cd server && node --watch index.js). BASE=http://host:port overrides the address.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
BASE="${BASE:-http://localhost:3100}"
FAILS=0
pass() { echo "PASS  $*"; }
warn() { echo "WARN  $*"; }
fail() { echo "FAIL  $*"; FAILS=$((FAILS+1)); }
mysql_run() { docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 -N -B theme_park' 2>/dev/null; }

echo "== tools"
for t in docker node npm curl; do
  command -v "$t" >/dev/null 2>&1 && pass "$t found" || fail "$t not found"
done
if command -v node >/dev/null 2>&1; then
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=12)?0:1)' \
    && pass "node $(node -v) (needs 20.12 or newer)" || fail "node $(node -v) is too old (needs 20.12 or newer)"
fi

echo "== config files"
for f in .env server/.env client/.env; do
  [ -f "$f" ] && pass "$f exists" || fail "$f is missing (bash scripts/dev-setup.sh creates all three)"
done
grep -q '^VITE_USE_MOCK=false' client/.env 2>/dev/null && pass "client/.env uses the real backend" || warn "client/.env does not set VITE_USE_MOCK=false (the client would show mock data)"

echo "== database"
DB_OK=0
if [ "$(echo 'SELECT 1' | mysql_run)" = "1" ]; then
  DB_OK=1; pass "MySQL container answers"
else
  fail "MySQL is not reachable (docker compose up -d --wait mysql)"
fi
if [ "$DB_OK" = 1 ]; then
  q() { echo "$1" | mysql_run; }
  TABLES=$(q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='theme_park' AND table_type='BASE TABLE'")
  VIEWS=$(q "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='theme_park'")
  TRIGS=$(q "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='theme_park'")
  [ "${TABLES:-0}" -ge 22 ] && pass "$TABLES tables" || fail "only ${TABLES:-0} tables (expected at least 22)"
  [ "${VIEWS:-0}" -ge 1 ]   && pass "$VIEWS views"   || fail "no views"
  [ "${TRIGS:-0}" -ge 6 ]   && pass "$TRIGS triggers" || fail "only ${TRIGS:-0} triggers (expected at least 6)"
  for t in Customer Ticket RideLog Purchase Employee; do
    n=$(q "SELECT COUNT(*) FROM $t"); [ "${n:-0}" -gt 0 ] && pass "$t has $n rows" || warn "$t is empty (SQL/tools/load_history.sh --no-generate)"
  done
  n=$(q "SELECT COUNT(*) FROM AppUser"); [ "${n:-0}" -gt 0 ] && pass "AppUser has $n logins" || warn "no logins yet (cd server && npm run seed)"
fi

echo "== backend ($BASE)"
body=$(curl -s -m 5 "$BASE/api/health" 2>/dev/null)
case "$body" in
  *'"ok":true'*) pass "GET /api/health -> ok" ;;
  "")            warn "backend is not running at $BASE (cd server && node --watch index.js)" ;;
  *)             fail "GET /api/health -> $body" ;;
esac

echo "== client build"
if [ -d client/node_modules ]; then
  OUT=$(mktemp -d)
  if (cd client && npx vite build --outDir "$OUT" --emptyOutDir >/dev/null 2>&1); then pass "vite build works"; else fail "vite build failed (cd client && npm run build to see why)"; fi
  rm -rf "$OUT"
else
  warn "client/node_modules missing (cd client && npm install)"
fi

if [ "${1:-}" = "--baseline" ]; then
  mkdir -p docs
  {
    echo "Baseline written $(date '+%Y-%m-%d %H:%M')"
    if [ "$DB_OK" = 1 ]; then
      echo; echo "== tables ($TABLES)";   echo "SELECT table_name FROM information_schema.tables WHERE table_schema='theme_park' AND table_type='BASE TABLE' ORDER BY 1" | mysql_run
      echo; echo "== views ($VIEWS)";     echo "SELECT table_name FROM information_schema.views WHERE table_schema='theme_park' ORDER BY 1" | mysql_run
      echo; echo "== triggers ($TRIGS)";  echo "SELECT CONCAT(trigger_name,'  ',event_manipulation,' ON ',event_object_table,' ',action_timing) FROM information_schema.triggers WHERE trigger_schema='theme_park' ORDER BY event_object_table, trigger_name" | mysql_run
    else
      echo; echo "(database was not reachable: tables, views and triggers left out)"
    fi
    echo; echo "== backend routes"
    perl -0777 -ne 'while(/\broute\(\s*[`\x27"]?([A-Z]+)[`\x27"]?\s*,\s*[`\x27"]([^`\x27"]+)[`\x27"]/g){print "$1 $2\n"}' server/routes/*.js | sort -u -k2,2 -k1,1
  } > docs/baseline.txt
  echo "wrote docs/baseline.txt"
fi

echo; [ "$FAILS" = 0 ] && echo "All checks passed ($FAILS failures)." || echo "$FAILS check(s) failed."
exit $((FAILS>0))

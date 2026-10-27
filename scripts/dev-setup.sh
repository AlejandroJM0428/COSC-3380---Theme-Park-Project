#!/usr/bin/env bash
# LOCAL dev setup for teammates. Safe to re-run: it never overwrites an existing .env file.
# It creates throwaway dev accounts. Never run it on geto, and never copy these passwords to geto.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "$(hostname)" = "geto" ] || [ "${NODE_ENV:-}" = "production" ]; then
  echo "Refusing to run: this script is for local development only." >&2
  exit 1
fi

for tool in docker node npm openssl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing tool: $tool" >&2; exit 1; }
done

DEV_PASSWORD="${DEV_PASSWORD:-themepark-dev}"  # password for every seeded dev account (override: DEV_PASSWORD=x bash scripts/dev-setup.sh)
DB_ROOT_PASSWORD="dev-root-password"           # local MySQL root password; only takes effect on a fresh database volume
SECRET="$(openssl rand -hex 32)"

write_if_missing() { # write_if_missing <file>   (file content comes in on stdin)
  if [ -e "$1" ]; then
    echo "keep    $1 (already exists)"
    cat >/dev/null
  else
    cat >"$1"
    echo "create  $1"
  fi
}

seed_lines() {
  for n in ADMIN MANAGER CASHIER RETAIL HR MAINTMGR TECH COOK; do echo "SEED_${n}_PASSWORD=$DEV_PASSWORD"; done
}

# Root .env: read by docker compose.
write_if_missing .env <<EOT
DB_PASSWORD=$DB_ROOT_PASSWORD
SESSION_SECRET=$SECRET
NODE_ENV=development
APP_PORT=3101
$(seed_lines)
EOT

# server/.env: read by the backend and the seed script when you run them on your own machine.
write_if_missing server/.env <<EOT
PORT=3100
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=$DB_ROOT_PASSWORD
DB_NAME=theme_park
SESSION_SECRET=$SECRET
$(seed_lines)
EOT

# client/.env: talk to the real backend, not the mock.
write_if_missing client/.env <<EOT
VITE_USE_MOCK=false
EOT

echo "Starting MySQL (a fresh database loads the schema, triggers and test data)..."
docker compose up -d --wait mysql

echo "Installing dependencies..."
( cd server && npm ci )
( cd client && npm ci )

echo "Creating the dev accounts..."
( cd server && npm run seed ) || {
  echo "Seeding failed. If it says 'Access denied', your local MySQL volume was created with a different root password." >&2
  echo "Reset it (this deletes ONLY your local database), then run this script again:" >&2
  echo "  docker compose down -v && bash scripts/dev-setup.sh" >&2
  exit 1
}

cat <<EOT

Done. Start the app in two terminals:
  cd server && node --watch index.js    # backend on http://localhost:3100
  cd client && npm run dev              # frontend: open the URL it prints

Log in at /staff/login as: admin, manager, cashier, retail, hr, maintmgr, tech or cook
Password for all of them: $DEV_PASSWORD
EOT

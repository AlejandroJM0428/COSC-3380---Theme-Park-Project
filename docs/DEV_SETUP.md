# Local dev setup (for the whole team)

Everyone gets **their own local database**. The structure and test data come from the `SQL/` files in git, so every copy matches. The shared demo site on `geto` is separate and is only changed through committed SQL.

## First time

You need Docker, Node 22 or newer, npm and openssl.

```bash
git pull
bash scripts/dev-setup.sh
```

- `git pull`: get the latest code, including the compose file that publishes MySQL on `127.0.0.1:3307`.
- `bash scripts/dev-setup.sh`: creates your three `.env` files (never overwrites existing ones), starts MySQL, installs dependencies and creates the dev accounts.

Then run the app in two terminals:

```bash
cd server && node --watch index.js
cd client && npm run dev
```

- `node --watch index.js`: run the backend and restart it when a file changes.
- `npm run dev`: run the Vite dev server, which forwards `/api` to the backend on port 3100.

Log in at `/staff/login` as `admin`, `manager`, `cashier`, `retail`, `hr`, `maintmgr`, `tech` or `cook`. Every dev account uses the password `themepark-dev` (override it with `DEV_PASSWORD=x bash scripts/dev-setup.sh`).

These passwords are **for your own machine only**. `geto` has its own `.env` with real secrets. Never copy these values there, and never put real passwords or password hashes in git.

## Rules that keep the databases from drifting

1. **Every database change is a numbered SQL file in `SQL/`**, written so it is safe to run twice (`CREATE OR REPLACE VIEW`, `DROP TRIGGER IF EXISTS`, `CREATE TABLE IF NOT EXISTS`). Register new files in `docker-compose.yml` next to the others. Never change a database by hand without committing the SQL.
2. **Your local data is yours.** Nobody commits dumps.
3. **`geto` is the demo copy.** Only change it by applying committed SQL files.

## Everyday commands

Apply a new SQL file to your existing local database:

```bash
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/08_new_thing.sql
```

- `docker compose exec -T mysql`: run a command inside the `mysql` service without a terminal (needed for `<`).
- `mysql -uroot -p"..." theme_park`: open the `theme_park` database as root, with the container's own password variable.
- `< <file>`: feed that file in as the commands to run.

Throw away your local database and rebuild it from `SQL/` (your machine only, never on `geto`):

```bash
docker compose down -v
bash scripts/dev-setup.sh
```

- `docker compose down -v`: stop and remove the containers **and their data volumes**.
- `bash scripts/dev-setup.sh`: start a fresh database and recreate the accounts.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Access denied` while seeding | Your local volume was created with another root password. Run the rebuild above. |
| `address already in use` on 3100 | Something else is on that port. Find it with `ss -ltnp 'sport = :3100'` and stop it, or change `PORT` in `server/.env` and the proxy target in `client/vite.config.js`. |
| Login says invalid, but no error | `client/.env` is missing `VITE_USE_MOCK=false`. In mock mode only the built-in demo users work, with the password `password`. |
| Seed prints "already exists, password unchanged" | The accounts exist. Set the `SEED_*_PASSWORD` values in `server/.env` and run `cd server && npm run seed` again. |

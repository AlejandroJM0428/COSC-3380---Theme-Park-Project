# Theme Park <img src="docs/beltway-helmet.svg" alt="Beltway Park astronaut helmet" height="40" align="center">

**Beltway Park** is a theme park management web app, loosely inspired by Astroworld. Visitors buy tickets and memberships and use a member portal. Staff run rides, maintenance, shifts, purchases, and reports. Admins manage logins and edit records.

Tech stack
----------
- Frontend: React 19, Vite, React Router, Recharts
- Backend: Node.js (no Express)
- Database: MySQL 8.4, run in Docker

Requirements
------------
Node 20.12 or newer, npm, and Docker with Compose.

Setup
-----
Create three `.env` files before running anything.

Root `.env` (used by Docker for MySQL):
```bash
cp .env.example .env
```
```env
DB_PASSWORD=dev-root-password
SESSION_SECRET=change_me_to_a_long_random_string
NODE_ENV=development
APP_PORT=3100
```

`server/.env` (`DB_PASSWORD` must match the root `.env`):
```bash
cp server/.env.example server/.env
```
```env
PORT=3100
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=dev-root-password
DB_NAME=theme_park
SESSION_SECRET=change_me_to_a_long_random_string
SEED_STAFF_PASSWORD=YourStaffPassword
```

`client/.env`:
```env
VITE_USE_MOCK=false
```
Without this the frontend runs on mock data and never touches the database.

Install dependencies:
```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

Run the database
----------------
```bash
docker compose up -d --wait mysql
```
The first start loads the schema, views, and triggers. MySQL is exposed on `127.0.0.1:3307`.

Then load the demo data and create the staff logins (once):
```bash
SQL/tools/load_history.sh --no-generate
cd server && npm run seed
```
Logins are named after an employee: first name plus the last four digits of their ID (for example `mason0028`). Passwords print once, so save them.

`docker-compose.yml` mounts `SQL/seed/02_test_data.sql`, which is generated and not in the zip. Run `python3 SQL/tools/gen_test_data.py` before the first start, or Docker creates an empty folder with that name.

Run the backend
---------------
```bash
cd server
node --watch index.js
```
Runs on http://localhost:3100. Health check: http://localhost:3100/api/health

Run the frontend
----------------
```bash
cd client
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173). It proxies `/api` to port 3100. Staff log in at `/staff/login`.

Backend
-------
The backend is plain Node.js. It uses the built-in `node:http` module instead of Express, and the pieces Express would normally provide are written by us.

Built on top of Node:
- `router.js`: route matching with path params, JSON body parsing, and a 100 KB body limit
- `session.js`: cookie sessions signed with HMAC-SHA256, stored in memory (a restart logs everyone out)
- `loginLimiter.js`: sign-in throttling by user, IP, and user plus IP
- `middleware/requireRole.js`: role-based access (401 if not logged in, 403 if the role is not allowed)
- `validate.js`: input checks shared by the data-entry routes
- `errors.js`: JSON responses and error handling
- `config.js`: loads `server/.env` with Node's built-in `process.loadEnvFile`
- `routes/`: one file per feature (auth, tickets, memberships, maintenance, shifts, reports, admin tools, and more)

Only two npm packages:
- `mysql2`: MySQL connection pool
- `bcrypt`: password hashing

Demo
----

### Homepage
![Beltway Park homepage with the header and notification bar](docs/screenshots/homepage.png)

### Admin portal
![Admin portal home with data tables and reports](docs/screenshots/admin-portal.png)

### Member portal
![Member portal showing membership and ticket details](docs/screenshots/member-portal.png)
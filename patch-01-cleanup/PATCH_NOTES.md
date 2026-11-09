## Patch 01: clean-up (2026-11-08)

- Applied the pending SQL reorganization: SQL files now live in `SQL/schema`, `views`, `rules`, `migrations`, `seed`, `tools`, `queries` (see `SQL/README.md`). The old flat files are removed (backup: `archive/patch-01-backup.tar.gz`).
- Kept the newer `05_notifications.sql` and `11_restore_triggers.sql` (they already include the sold-out fix); `23_sold_out_replaces_selling_fast.sql` moved to `SQL/migrations/`.
- `docker-compose.yml`, `README.md`, `.gitignore`, `.dockerignore` and three server comments updated to the new SQL paths.
- Moved to `archive/` (original paths kept): unused client files `ErrorMessage`, `QuickBuy`, `RideTeaser`, `ThingsToDo`, `TicketsMembershipsPromo`, `VisitorPortal` (jsx + css), `Login.jsx`, unused assets and `client/README.md`; the finished reorg patch (`sql-reorg-patch/`, `apply-sql-reorg.sh`); duplicate helper scripts `zipitup.sh`, `zip-project.sh`, `db-inventory.sh`.
- `archive/` added to `.gitignore` and `.dockerignore`.
- Not changed: `.env`, `check.sh`, `backup.sh`, `project-audit.sh`, `apply-history-on-server.sh`, `scripts/dev-setup.sh`.
- Known, not fixed here: `python3 SQL/tools/gen_test_data.py` stops with `IndexError: Cannot choose from an empty sequence` (same on the original files). `SQL/seed/02_test_data.sql` is still not in the repo, so the compose file mounts a missing file.

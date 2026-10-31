import { route } from '../router.js';
import { pool } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
import { TRIGGER_CATALOG } from '../demos/triggerCatalog.js';

// GET /api/triggers  (Admin only)
// Read-only. Compares the six project triggers with the live database.
route(
  'GET',
  '/api/triggers',
  requireRole('Admin')(async () => {
    let liveRows = [];
    let live = true;
    try {
      const [rows] = await pool.query(
        `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS tbl, ACTION_TIMING AS timing,
                EVENT_MANIPULATION AS event, ACTION_STATEMENT AS body
           FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE()
          ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`,
      );
      liveRows = rows;
    } catch {
      live = false;
    }
    if (liveRows.length === 0) live = false;

    const byName = new Map(liveRows.map((r) => [String(r.name).toLowerCase(), r]));
    const known = new Set(TRIGGER_CATALOG.map((t) => t.name.toLowerCase()));

    const triggers = TRIGGER_CATALOG.map((t) => {
      const row = byName.get(t.name.toLowerCase());
      return {
        ...t,
        errors: t.errors ?? [],
        inDatabase: live ? Boolean(row) : null,
        body: row?.body ?? null,
      };
    });

    const extra = liveRows
      .filter((row) => !known.has(String(row.name).toLowerCase()))
      .map((row) => row.name);

    return { live, liveCount: liveRows.length, expected: TRIGGER_CATALOG.length, triggers, extra };
  }),
);

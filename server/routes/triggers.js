import { route } from '../router.js';
import { pool } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
import { TRIGGER_CATALOG, EVENT_NOTE } from '../demos/triggerCatalog.js';

// GET /api/triggers  (Admin, Manager)
// Read-only. Asks the database which triggers really exist (information_schema) and matches them to the
// plain-English catalog. `live` is false when the database user is not allowed to read the trigger list;
// the page then shows the catalog only and says so.
route(
  'GET',
  '/api/triggers',
  requireRole('Admin', 'Manager')(async () => {
    let liveRows = [];
    let live = true;
    try {
      const [rows] = await pool.query(
        `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS tbl, ACTION_TIMING AS timing,
                EVENT_MANIPULATION AS event, ACTION_STATEMENT AS body
           FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE()
          ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING DESC, EVENT_MANIPULATION`,
      );
      liveRows = rows;
    } catch {
      live = false;
    }
    if (liveRows.length === 0) live = false; // no rows usually means "not allowed to see them", not "none exist"

    const byName = new Map(liveRows.map((r) => [String(r.name).toLowerCase(), r]));
    const known = new Set(TRIGGER_CATALOG.map((t) => t.name.toLowerCase()));

    const triggers = TRIGGER_CATALOG.map((t) => {
      const row = byName.get(t.name.toLowerCase());
      return {
        ...t,
        errors: t.errors ?? [],
        demos: t.demos ?? [],
        inDatabase: live ? Boolean(row) : null,
        body: row?.body ?? null,
      };
    });

    // Triggers that exist in the database but are not described in the catalog.
    for (const row of liveRows) {
      if (known.has(String(row.name).toLowerCase())) continue;
      triggers.push({
        name: row.name,
        table: row.tbl,
        timing: row.timing,
        event: row.event,
        kind: 'Other',
        rule: 'In the database but not described yet.',
        errors: [],
        demos: [],
        inDatabase: true,
        body: row.body,
      });
    }

    // Notices the notification triggers have actually created (empty if SQL/05 has not been applied).
    let recent = [];
    try {
      const [rows] = await pool.query(
        `SELECT NotificationID, Kind, Severity, Title, Message, CreatedAt
           FROM Notification
          WHERE Kind IN ('SoldOut', 'Weather', 'MaintenanceClosed')
          ORDER BY CreatedAt DESC
          LIMIT 10`,
      );
      recent = rows;
    } catch {
      recent = [];
    }

    return { live, liveCount: liveRows.length, triggers, recent, eventNote: EVENT_NOTE };
  }),
);

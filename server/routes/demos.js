import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { DEMOS } from '../demos/definitions.js';
import './triggers.js'; // registers GET /api/triggers (the Triggers page)

route(
  'GET',
  '/api/demos',
  requireRole('Admin', 'Manager')(async () =>
    DEMOS.map(({ id, title, proves }) => ({ id, title, proves })),
  ),
);

// Body: { mode: 'blocked' | 'allowed' } (default blocked).
// Always rolled back. Returns { blocked, message, expected, matches }.
route(
  'POST',
  '/api/demos/:id/run',
  requireRole('Admin', 'Manager')(async (ctx) => {
    const demo = DEMOS.find((d) => d.id === ctx.params.id);
    if (!demo) throw new HttpError(404, 'Unknown demo');
    const mode = ctx.body.mode === 'allowed' ? 'allowed' : 'blocked';

    const conn = await pool.getConnection();
    try {
      await conn.query('START TRANSACTION');
      for (const sql of demo.setup) await conn.query(sql); // a failure here is a bug in the demo, so it becomes a 500

      try {
        for (const sql of mode === 'allowed' ? demo.good : demo.bad) await conn.query(sql);
        return { demo: demo.id, mode, blocked: false, message: demo.allowedText, saved: false };
      } catch (err) {
        if (err.errno !== 1644) throw err;
        return {
          demo: demo.id,
          mode,
          blocked: true,
          message: err.sqlMessage,
          expected: demo.expected,
          matches: err.sqlMessage === demo.expected,
          saved: false,
        };
      }
    } finally {
      await conn.query('ROLLBACK').catch(() => {});
      conn.release();
    }
  }),
);

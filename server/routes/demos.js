import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { DEMOS } from '../demos/definitions.js';
import './triggers.js'; // registers GET /api/triggers
import './dataentry.js'; // registers the customers, memberships, purchases, game plays, ride log and weather routes

const publicDemo = (demo) => ({
  id: demo.id,
  trigger: demo.trigger,
  title: demo.title,
  rule: demo.rule,
  inputs: demo.inputs,
  sql: demo.sql,
  expect: demo.expect,
  sqlKind: demo.sqlKind || 'INSERT',
  spotlight: demo.spotlight || null,
  timing: demo.timing || null,
  purpose: demo.purpose || null,
  action: demo.action || null,
  shows: demo.shows || null,
  button: demo.button || 'Run against MySQL',
});

route(
  'GET',
  '/api/demos',
  requireRole('Admin', 'Manager')(async () => DEMOS.map(publicDemo)),
);

function cell(value) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return String(value[0]);
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return String(value);
}

function same(left, right) {
  const a = cell(left);
  const b = cell(right);
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return a === b;
}

// POST /api/demos/:id/run
// Runs the scenario's INSERT in a transaction and always rolls it back.
route(
  'POST',
  '/api/demos/:id/run',
  requireRole('Admin', 'Manager')(async (ctx) => {
    const demo = DEMOS.find((d) => d.id === ctx.params.id);
    if (!demo) throw new HttpError(404, 'Unknown demo');

    const conn = await pool.getConnection();
    try {
      await conn.query('START TRANSACTION');
      for (const sql of demo.setup) await conn.query(sql);
      await conn.query(demo.sql);

      let after = null;
      if (demo.inspect) {
        const [rows] = await conn.query(demo.inspect);
        after = rows[0] ?? null;
      }
      const before = demo.before ?? null;
      const differs = before && after
        ? Object.keys(before).some((key) => !same(before[key], after[key]))
        : false;

      let outcome = differs ? 'warning' : 'success';
      let message = differs
        ? 'Accepted. The trigger replaced a value before the row was stored.'
        : 'Accepted. The trigger allowed this statement.';
      if (demo.expect === 'notify') {
        outcome = after?.Title ? 'success' : 'warning';
        message = after?.Title
          ? 'The trigger inserted this notification.'
          : 'The update ran, but the trigger did not insert a notification.';
      } else if (demo.expect === 'error') {
        outcome = 'warning';
        message = 'The database accepted this insert. It was expected to refuse it.';
      } else if (demo.expect === 'assign' && !differs) {
        outcome = 'warning';
        message = 'The row was saved, but the trigger did not change a value.';
      }

      return {
        ...publicDemo(demo),
        outcome,
        message,
        before,
        after,
        saved: false,
      };
    } catch (err) {
      if (err.errno !== 1644) throw err;
      const matches = err.sqlMessage === demo.errorText;
      return {
        ...publicDemo(demo),
        outcome: 'error',
        message: err.sqlMessage,
        expected: demo.errorText ?? null,
        matches,
        before: null,
        after: null,
        saved: false,
      };
    } finally {
      await conn.query('ROLLBACK').catch(() => {});
      conn.release();
    }
  }),
);

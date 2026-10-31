import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Admin tools. Every route here is Admin only, checked on the server (not just hidden in the page).
// Other admin route files import { adminOnly, audit } from './admin.js'.
export const adminOnly = requireRole('Admin');

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

// Writes one row to AdminAudit. Call it from inside an adminOnly handler (it needs ctx.session).
// Pass `db` (a connection that is inside a transaction) to make the audit row commit or roll back
// together with the change it describes. Throws if the row cannot be written, so a change is never silent.
export async function audit(ctx, action, { table = null, rowKey = null, detail = null } = {}, db = pool) {
  if (!ctx.session?.username) throw new HttpError(500, 'Audit needs a signed-in admin');
  const text = detail != null && typeof detail !== 'string' ? JSON.stringify(detail) : detail;
  await db.query(
    'INSERT INTO AdminAudit (Username, Action, TableName, RowKey, Detail) VALUES (?, ?, ?, ?, ?)',
    [clip(ctx.session.username, 60), clip(action, 40), clip(table, 64), clip(rowKey, 100), clip(text, 2000)],
  );
}

// Who am I, and is the audit table in place? auditReady is false until SQL/10_admin_audit.sql is applied.
route(
  'GET',
  '/api/admin/ping',
  adminOnly(async (ctx) => {
    let auditReady = true;
    try {
      await pool.query('SELECT 1 FROM AdminAudit LIMIT 1');
    } catch (err) {
      if (err?.errno !== 1146) throw err; // 1146 = table does not exist
      auditReady = false;
    }
    return { ok: true, username: ctx.session.username, role: ctx.session.role, auditReady };
  }),
);

// Latest audit rows, newest first. ?limit= defaults to 50, at most 200.
route(
  'GET',
  '/api/admin/audit',
  adminOnly(async (ctx) => {
    const raw = ctx.query.limit === undefined ? 50 : Number(ctx.query.limit);
    if (!Number.isInteger(raw) || raw < 1 || raw > 200) throw new HttpError(400, 'Limit must be a whole number from 1 to 200');
    const [rows] = await pool.query(
      'SELECT AuditID, AuditTime, Username, Action, TableName, RowKey, Detail FROM AdminAudit ORDER BY AuditID DESC LIMIT ?',
      [raw],
    );
    return rows;
  }),
);

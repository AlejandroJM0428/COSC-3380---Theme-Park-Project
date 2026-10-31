import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { adminOnly, audit } from './admin.js';

// SQL Console (admin only). One statement per request.
//
// Read mode (the default): the statement runs inside START TRANSACTION READ ONLY, so MySQL itself
//   refuses any change. It is always rolled back. A first-word check gives a clearer message first.
// Write mode: needs write=true AND confirm="WRITE" in the request. The statement is written to
//   AdminAudit BEFORE it runs, and again with the result if it succeeds. Triggers and constraints still apply.
// Never allowed, in either mode: writing files, user and grant changes, dropping the database,
//   and changing the audit log from here.

const MAX_SQL = 5000;
const MAX_ROWS = 500;
const TIMEOUT_MS = 5000;
const HIDDEN = /password|hash|secret/i;

const READ_START = /^\s*\(*\s*(select|show|describe|desc|explain|with)\b/i;
const PURE_READ = /^\s*\(*\s*(select|show|describe|desc|explain)\b/i;
const WRITE_START = /^\s*(insert|update|delete|replace|create|alter|drop|truncate|call|select|show|describe|desc|explain|with)\b/i;
const FILE_ACCESS = /\binto\s+(outfile|dumpfile)\b|\bload_file\s*\(|\bload\s+data\b/i;
const NEVER = /^\s*(drop\s+(database|schema|user)|create\s+(database|schema|user)|alter\s+user)\b/i;

function cleanSql(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(400, 'Type a SQL statement first');
  const sql = raw.trim().replace(/;\s*$/, '').trim(); // one trailing semicolon is fine
  if (!sql) throw new HttpError(400, 'Type a SQL statement first');
  if (sql.length > MAX_SQL) throw new HttpError(400, `Statement must be ${MAX_SQL} characters or fewer`);
  return sql;
}

function checkStatement(sql, write) {
  if (FILE_ACCESS.test(sql)) throw new HttpError(400, 'Reading or writing server files is not allowed from the console');
  if (!write) {
    if (!READ_START.test(sql)) {
      throw new HttpError(400, 'Read-only mode runs SELECT, SHOW, DESCRIBE, EXPLAIN or WITH. Turn on write mode to change data.');
    }
    return;
  }
  if (!WRITE_START.test(sql)) throw new HttpError(400, 'Statement must start with SELECT, INSERT, UPDATE, DELETE, REPLACE, CREATE, ALTER, DROP, TRUNCATE or CALL');
  if (NEVER.test(sql)) throw new HttpError(400, 'Dropping or creating databases and users is not allowed from the console');
  if (/\badminaudit\b/i.test(sql) && !PURE_READ.test(sql)) throw new HttpError(400, 'The audit log cannot be changed from the console');
}

// Turns what mysql2 returns into plain JSON. Rows come back as arrays so duplicate column names survive.
function shape([rows, fields]) {
  let set = null;
  if (Array.isArray(fields) && Array.isArray(fields[0])) set = { rows: rows[0], fields: fields[0] }; // CALL: first result set only
  else if (Array.isArray(fields) && fields.length > 0 && typeof fields[0]?.name === 'string') set = { rows, fields };
  else if (Array.isArray(rows) && Array.isArray(fields)) set = { rows, fields }; // zero columns edge case

  if (set) {
    const names = set.fields.map((f) => f.name);
    const hide = names.map((n) => HIDDEN.test(n));
    const clean = (v) => (Buffer.isBuffer(v) ? `[binary ${v.length} bytes]` : v);
    const all = set.rows;
    return {
      kind: 'rows',
      columns: names,
      rows: all.slice(0, MAX_ROWS).map((r) => r.map((v, i) => (hide[i] ? '[hidden]' : clean(v)))),
      rowCount: all.length,
      truncated: all.length > MAX_ROWS,
    };
  }
  return {
    kind: 'write',
    affectedRows: rows.affectedRows ?? 0,
    changedRows: rows.changedRows ?? 0,
    insertId: rows.insertId || null,
    info: rows.info || '',
  };
}

function mapDbError(err) {
  if (err instanceof HttpError) return err;
  if (err?.errno === 1792) return new HttpError(400, 'This statement would change data. Turn on write mode to run it.');
  if (err?.errno === 3024) return new HttpError(400, `The query took longer than ${TIMEOUT_MS / 1000} seconds and was stopped`);
  if (err?.sqlMessage) return new HttpError(400, err.sqlMessage); // admins may see database messages
  return err;
}

route(
  'POST',
  '/api/admin/sql',
  adminOnly(async (ctx) => {
    const sql = cleanSql(ctx.body.sql);
    const write = ctx.body.write === true;
    if (write && ctx.body.confirm !== 'WRITE') throw new HttpError(400, 'Type WRITE to confirm write mode');
    checkStatement(sql, write);

    if (write) {
      await audit(ctx, 'SQL_WRITE', { detail: sql }); // fatal: no audit row, no change
    } else {
      await audit(ctx, 'SQL_READ', { detail: sql }).catch((e) => console.error('Audit write failed:', e.message));
    }

    const conn = await pool.getConnection();
    let broken = false;
    const started = Date.now();
    try {
      await conn.query('SET SESSION max_execution_time = ?', [TIMEOUT_MS]);
      let result;
      if (write) {
        await conn.beginTransaction();
        try {
          result = await conn.query({ sql, rowsAsArray: true });
          await conn.commit();
        } catch (err) {
          await conn.rollback().catch(() => { broken = true; });
          throw err;
        }
      } else {
        await conn.query('START TRANSACTION READ ONLY');
        try {
          result = await conn.query({ sql, rowsAsArray: true });
        } finally {
          await conn.query('ROLLBACK').catch(() => { broken = true; });
        }
      }
      const out = shape(result);
      if (write) {
        const detail = out.kind === 'write' ? `ok, ${out.affectedRows} row(s) affected` : `ok, ${out.rowCount} row(s) returned`;
        await audit(ctx, 'SQL_WRITE_OK', { detail }).catch((e) => console.error('Audit write failed:', e.message));
      }
      return { mode: write ? 'write' : 'read', ms: Date.now() - started, ...out };
    } catch (err) {
      throw mapDbError(err);
    } finally {
      await conn.query('SET SESSION max_execution_time = 0').catch(() => { broken = true; });
      if (broken) conn.destroy();
      else conn.release();
    }
  }),
);

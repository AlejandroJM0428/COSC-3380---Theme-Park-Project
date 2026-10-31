import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { friendlyDbError } from '../validate.js';
import { adminOnly, audit } from './admin.js';

// Dean mode (admin only): insert, edit and delete one row in any base table.
//   POST /api/admin/rows/:table          { values: { Column: value, ... } }            insert
//   PUT  /api/admin/rows/:table          { key: { PkColumn: value }, values: {...} }   edit
//   POST /api/admin/rows/:table/delete   { key: { PkColumn: value } }                  delete
// (Delete is a POST because the router only reads a body on POST, PUT and PATCH.)
//
// These are ordinary INSERT / UPDATE / DELETE statements, so triggers and constraints still run and
// a rule that is broken comes back as the trigger's own message. Table and column names are checked
// against information_schema and only the real names are used. Values are always bound.
// Each change runs in one transaction together with its AdminAudit row: if the audit row cannot be
// written, or the database refuses the change, nothing is kept.
// Not allowed: views, the AdminAudit table, calculated columns, and password/hash/secret columns.

const HIDDEN = /password|hash|secret/i;
const AUDIT_TABLE = 'AdminAudit';
const TEXT_TYPES = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set']);

const EXTRA = {
  1366: 'A value has the wrong type for its column',
  1265: 'A value is not valid for its column',
  1264: 'A number is out of range for its column',
  1406: 'A text value is too long for its column',
  1364: 'A required column has no value',
  1054: 'A column name is not valid for this table',
};

// Friendly text for common errors. Trigger messages (1644) pass through to handleError untouched.
// Any other database message is shown to the admin as is, the same as the SQL console does.
function dbError(err) {
  if (err instanceof HttpError) return err;
  const mapped = friendlyDbError(err, EXTRA);
  if (mapped !== err) return mapped;
  if (err?.errno !== 1644 && err?.sqlMessage) return new HttpError(400, err.sqlMessage);
  return err;
}

// The table's real name, its columns and its primary key, all from information_schema.
async function loadTable(db, name) {
  const [found] = await db.query(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')`,
    [name],
  );
  if (found.length === 0) throw new HttpError(404, 'Table not found');
  const table = found[0].name;
  if (found[0].type === 'VIEW') throw new HttpError(400, 'A view cannot be edited. Edit the table behind it.');
  if (table.toLowerCase() === AUDIT_TABLE.toLowerCase()) throw new HttpError(400, 'The audit log cannot be edited');

  const [colRows] = await db.query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_KEY AS keyType, (IS_NULLABLE = 'YES') AS nullable, EXTRA AS extra
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table],
  );
  const columns = new Map();
  for (const c of colRows) {
    columns.set(c.name, {
      name: c.name,
      type: String(c.type).toLowerCase(),
      key: c.keyType === 'PRI',
      nullable: Boolean(c.nullable),
      generated: /generated/i.test(c.extra || ''),
      auto: /auto_increment/i.test(c.extra || ''),
      hidden: HIDDEN.test(c.name),
    });
  }
  const primaryKey = [...columns.values()].filter((c) => c.key).map((c) => c.name);
  if (primaryKey.length === 0) throw new HttpError(400, 'This table has no primary key, so a single row cannot be picked out safely');
  return { table, columns, primaryKey };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Checks a { Column: value } object from the request and returns [[column, value], ...] ready to bind.
// `forWrite` columns must exist, must not be calculated, and must not be secret.
function cleanValues(input, info, label, { forWrite }) {
  if (!isPlainObject(input)) throw new HttpError(400, `${label} must be an object of column values`);
  const out = [];
  for (const [name, raw] of Object.entries(input)) {
    const col = info.columns.get(name);
    if (!col) throw new HttpError(400, `Column "${name}" does not exist in ${info.table}`);
    if (forWrite && col.generated) throw new HttpError(400, `${name} is calculated by the database and cannot be set`);
    if (forWrite && col.hidden) throw new HttpError(400, `${name} is protected and cannot be edited here. Use the Users page.`);
    let v = raw;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (v !== null && typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${name} must be text, a number, true/false or null`);
    if (typeof v === 'number' && !Number.isFinite(v)) throw new HttpError(400, `${name} must be a real number`);
    if (v === '' && col.nullable && !TEXT_TYPES.has(col.type)) v = null; // an empty date or number box means "no value"
    if (v === null && !col.nullable && !col.auto && !forWrite) throw new HttpError(400, `${name} cannot be empty`);
    out.push([name, v]);
  }
  return out;
}

// The key must name exactly the primary key columns, each with a real value.
function cleanKey(input, info) {
  const pairs = cleanValues(input, info, 'Key', { forWrite: false });
  const names = pairs.map(([n]) => n).sort().join('|');
  if (names !== [...info.primaryKey].sort().join('|')) {
    throw new HttpError(400, `Key must be exactly: ${info.primaryKey.join(', ')}`);
  }
  for (const [n, v] of pairs) if (v === null || v === '') throw new HttpError(400, `Key value for ${n} is required`);
  return pairs;
}

const keyText = (pairs) => pairs.map(([n, v]) => `${n}=${v}`).join(', ');

function whereOf(pairs) {
  return {
    sql: pairs.map(() => '?? = ?').join(' AND '),
    args: pairs.flatMap(([n, v]) => [n, v]),
  };
}

// Secret columns never leave the server, not even to the admin who owns the account.
function mask(row, info) {
  if (!row) return row;
  const out = { ...row };
  for (const c of info.columns.values()) if (c.hidden && c.name in out) out[c.name] = '[hidden]';
  return out;
}

async function readRow(conn, info, pairs, lock = false) {
  const w = whereOf(pairs);
  const [rows] = await conn.query(`SELECT * FROM ?? WHERE ${w.sql}${lock ? ' FOR UPDATE' : ''}`, [info.table, ...w.args]);
  return rows[0] ?? null;
}

// Runs fn(conn) inside a transaction. Commits on success, rolls everything back on any error.
async function inTransaction(fn) {
  const conn = await pool.getConnection();
  let broken = false;
  try {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {
        broken = true;
      });
      throw dbError(err);
    }
  } finally {
    if (broken) conn.destroy();
    else conn.release();
  }
}

// True when the stored value and the new value mean the same thing (10.00 and 10 do).
function same(a, b) {
  if (a == null || b == null) return a == null && b == null;
  const x = String(a);
  const y = String(b);
  if (x === y) return true;
  return x.trim() !== '' && y.trim() !== '' && Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && Number(x) === Number(y);
}

// Insert one row. Returns the row as stored (after triggers ran).
route(
  'POST',
  '/api/admin/rows/:table',
  adminOnly(async (ctx) => {
    const info = await loadTable(pool, ctx.params.table);
    const values = cleanValues(ctx.body.values, info, 'Values', { forWrite: true });
    if (values.length === 0) throw new HttpError(400, 'Give at least one column value');

    return inTransaction(async (conn) => {
      const [result] = await conn.query(`INSERT INTO ?? (??) VALUES (${values.map(() => '?').join(', ')})`, [
        info.table,
        values.map(([n]) => n),
        ...values.map(([, v]) => v),
      ]);

      // Work out the new row's key: the values given, plus the new auto id if the table made one.
      const given = new Map(values);
      const keyPairs = info.primaryKey.map((n) => {
        if (given.has(n) && given.get(n) !== null) return [n, given.get(n)];
        if (info.columns.get(n).auto && result.insertId) return [n, result.insertId];
        return [n, null];
      });
      const known = keyPairs.every(([, v]) => v !== null);
      const row = known ? await readRow(conn, info, keyPairs) : null;
      await audit(
        ctx,
        'ROW_INSERT',
        { table: info.table, rowKey: known ? keyText(keyPairs) : null, detail: { values: Object.fromEntries(values) } },
        conn,
      );
      return { ok: true, action: 'insert', table: info.table, key: known ? Object.fromEntries(keyPairs) : null, row: mask(row, info) };
    });
  }),
);

// Edit one row, picked by its full primary key. Only columns whose value really changes are written and logged.
route(
  'PUT',
  '/api/admin/rows/:table',
  adminOnly(async (ctx) => {
    const info = await loadTable(pool, ctx.params.table);
    const keyPairs = cleanKey(ctx.body.key, info);
    const values = cleanValues(ctx.body.values, info, 'Values', { forWrite: true });
    if (values.length === 0) throw new HttpError(400, 'Give at least one column value');

    return inTransaction(async (conn) => {
      const before = await readRow(conn, info, keyPairs, true);
      if (!before) throw new HttpError(404, 'Row not found');

      const changes = values.filter(([n, v]) => !same(before[n], v));
      if (changes.length === 0) {
        return { ok: true, action: 'update', table: info.table, changed: [], key: Object.fromEntries(keyPairs), row: mask(before, info) };
      }

      const w = whereOf(keyPairs);
      await conn.query(`UPDATE ?? SET ${changes.map(() => '?? = ?').join(', ')} WHERE ${w.sql}`, [
        info.table,
        ...changes.flatMap(([n, v]) => [n, v]),
        ...w.args,
      ]);

      // If the key itself was edited, the row now lives under the new key.
      const newKey = keyPairs.map(([n, v]) => {
        const edited = changes.find(([cn]) => cn === n);
        return [n, edited ? edited[1] : v];
      });
      const after = await readRow(conn, info, newKey);
      const diff = Object.fromEntries(changes.map(([n]) => [n, { from: before[n] ?? null, to: after ? (after[n] ?? null) : null }]));
      await audit(ctx, 'ROW_UPDATE', { table: info.table, rowKey: keyText(keyPairs), detail: { changed: diff } }, conn);
      return {
        ok: true,
        action: 'update',
        table: info.table,
        changed: changes.map(([n]) => n),
        key: Object.fromEntries(newKey),
        row: mask(after, info),
      };
    });
  }),
);

// Delete one row, picked by its full primary key. The deleted row is kept in the audit detail.
// Rows that point at this one are handled by the foreign keys (refused, or removed with it if the key says CASCADE).
route(
  'POST',
  '/api/admin/rows/:table/delete',
  adminOnly(async (ctx) => {
    const info = await loadTable(pool, ctx.params.table);
    const keyPairs = cleanKey(ctx.body.key, info);

    return inTransaction(async (conn) => {
      const before = await readRow(conn, info, keyPairs, true);
      if (!before) throw new HttpError(404, 'Row not found');
      if (info.table === 'AppUser' && String(before.Username).toLowerCase() === String(ctx.session.username).toLowerCase()) {
        throw new HttpError(400, 'You cannot delete the account you are signed in with');
      }

      const w = whereOf(keyPairs);
      await conn.query(`DELETE FROM ?? WHERE ${w.sql}`, [info.table, ...w.args]);
      await audit(ctx, 'ROW_DELETE', { table: info.table, rowKey: keyText(keyPairs), detail: { deleted: mask(before, info) } }, conn);
      return { ok: true, action: 'delete', table: info.table, key: Object.fromEntries(keyPairs) };
    });
  }),
);

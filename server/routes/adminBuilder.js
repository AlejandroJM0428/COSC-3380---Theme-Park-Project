import { format } from 'mysql2';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { adminOnly, audit } from './admin.js';
import { runReadOnly } from './adminSql.js';

// SQL GUI / query builder (admin only, read only).
// POST /api/admin/builder
//   { table, columns?: [..], filters?: [{ column, op, value? }], match?: 'all'|'any', sort?, dir?, limit? }
// The request is data, never SQL. The table and every column are looked up in information_schema and only
// the real names are used (as ?? identifiers). Operators come from a fixed list. Values are bound.
// The statement then runs through runReadOnly() from adminSql.js, the same read-only path as the SQL console:
// a READ ONLY transaction that is always rolled back, with a time limit.
// The response includes `sql`, the statement with the values filled in, so the page can show it and the
// admin can paste it into the SQL console. Columns that look like secrets (password, hash, secret) cannot be
// selected, filtered or sorted, because a filter on a hash would reveal it.

const HIDDEN = /password|hash|secret/i;
const MAX_FILTERS = 10;
const MAX_IN = 50;
const MAX_TEXT = 500;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const OPS = {
  '=': { sql: '=', kind: 'value' },
  '!=': { sql: '<>', kind: 'value' },
  '<': { sql: '<', kind: 'value' },
  '<=': { sql: '<=', kind: 'value' },
  '>': { sql: '>', kind: 'value' },
  '>=': { sql: '>=', kind: 'value' },
  LIKE: { sql: 'LIKE', kind: 'value' },
  'NOT LIKE': { sql: 'NOT LIKE', kind: 'value' },
  IN: { sql: 'IN', kind: 'list' },
  'IS NULL': { sql: 'IS NULL', kind: 'none' },
  'IS NOT NULL': { sql: 'IS NOT NULL', kind: 'none' },
};

function scalar(v, label) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new HttpError(400, `${label} must be a real number`);
    return v;
  }
  if (typeof v === 'string') {
    if (v.length > MAX_TEXT) throw new HttpError(400, `${label} must be ${MAX_TEXT} characters or fewer`);
    return v;
  }
  throw new HttpError(400, `${label} must be text, a number or true/false`);
}

route(
  'POST',
  '/api/admin/builder',
  adminOnly(async (ctx) => {
    const b = ctx.body ?? {};

    // The real table and its columns, from the database.
    if (typeof b.table !== 'string' || !b.table) throw new HttpError(400, 'Pick a table');
    const [found] = await pool.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')`,
      [b.table],
    );
    if (found.length === 0) throw new HttpError(404, 'Table not found');
    const table = found[0].name;
    const [colRows] = await pool.query(
      `SELECT COLUMN_NAME AS name
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [table],
    );
    const known = new Map(colRows.map((c) => [c.name, { name: c.name, hidden: HIDDEN.test(c.name) }]));

    // A column from the request: must exist and must not be a secret.
    const pick = (name, label) => {
      const col = typeof name === 'string' ? known.get(name) : undefined;
      if (!col) throw new HttpError(400, `${label} "${String(name).slice(0, 60)}" does not exist in ${table}`);
      if (col.hidden) throw new HttpError(400, `${col.name} is hidden and cannot be used here`);
      return col.name;
    };

    // Columns to show. Nothing chosen = every visible column, listed by name (never SELECT *).
    let columns;
    if (b.columns === undefined || (Array.isArray(b.columns) && b.columns.length === 0)) {
      columns = [...known.values()].filter((c) => !c.hidden).map((c) => c.name);
      if (columns.length === 0) throw new HttpError(400, 'This table has no columns that can be shown');
    } else {
      if (!Array.isArray(b.columns)) throw new HttpError(400, 'Columns must be a list');
      columns = [...new Set(b.columns.map((c) => pick(c, 'Column')))];
    }

    // Filters.
    const rawFilters = b.filters ?? [];
    if (!Array.isArray(rawFilters)) throw new HttpError(400, 'Filters must be a list');
    if (rawFilters.length > MAX_FILTERS) throw new HttpError(400, `Use ${MAX_FILTERS} filters or fewer`);
    const where = [];
    const args = [];
    for (const [i, f] of rawFilters.entries()) {
      const label = `Filter ${i + 1}`;
      if (f === null || typeof f !== 'object' || Array.isArray(f)) throw new HttpError(400, `${label} must be an object`);
      const opKey = String(f.op ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
      const op = Object.hasOwn(OPS, opKey) ? OPS[opKey] : null;
      if (!op) throw new HttpError(400, `${label}: operator must be one of ${Object.keys(OPS).join(', ')}`);
      const col = pick(f.column, `${label} column`);
      if (op.kind === 'none') {
        where.push(`?? ${op.sql}`);
        args.push(col);
      } else if (op.kind === 'list') {
        if (!Array.isArray(f.value) || f.value.length === 0 || f.value.length > MAX_IN) {
          throw new HttpError(400, `${label}: IN needs a list of 1 to ${MAX_IN} values`);
        }
        where.push(`?? IN (?)`);
        args.push(col, f.value.map((v) => scalar(v, `${label} value`)));
      } else {
        if (f.value === null || f.value === undefined) throw new HttpError(400, `${label}: give a value, or use IS NULL`);
        where.push(`?? ${op.sql} ?`);
        args.push(col, scalar(f.value, `${label} value`));
      }
    }
    const match = b.match === undefined ? 'all' : b.match;
    if (match !== 'all' && match !== 'any') throw new HttpError(400, 'Match must be all or any');

    // Sort and limit.
    let orderSql = '';
    const orderArgs = [];
    if (b.sort !== undefined && b.sort !== null && b.sort !== '') {
      const dir = b.dir === undefined ? 'asc' : String(b.dir).toLowerCase();
      if (dir !== 'asc' && dir !== 'desc') throw new HttpError(400, 'Direction must be asc or desc');
      orderSql = ` ORDER BY ?? ${dir.toUpperCase()}`;
      orderArgs.push(pick(b.sort, 'Sort column'));
    }
    let limit = DEFAULT_LIMIT;
    if (b.limit !== undefined && b.limit !== null && b.limit !== '') {
      limit = typeof b.limit === 'string' && b.limit.trim() !== '' ? Number(b.limit) : b.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new HttpError(400, `Limit must be a whole number from 1 to ${MAX_LIMIT}`);
      }
    }

    const whereSql = where.length ? ` WHERE ${where.join(match === 'any' ? ' OR ' : ' AND ')}` : '';
    const sql = `SELECT ?? FROM ??${whereSql}${orderSql} LIMIT ${limit}`;
    const params = [columns, table, ...args, ...orderArgs];
    const shown = format(sql, params); // for display and the audit log only; the database gets sql + params

    await audit(ctx, 'BUILDER_READ', { table, detail: shown }).catch((e) => console.error('Audit write failed:', e.message));
    const out = await runReadOnly(sql, params);
    return { mode: 'read', table, type: found[0].type === 'VIEW' ? 'view' : 'table', sql: shown, ...out };
  }),
);

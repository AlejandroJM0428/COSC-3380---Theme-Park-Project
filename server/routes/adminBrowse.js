import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { adminOnly } from './admin.js';

// Browse Table (admin only). Read-only: lists every table and view, and shows one page of rows.
// The table name is looked up in information_schema and never pasted into SQL as the browser sent it.
// Columns that look like secrets (password hashes) are not read from the database. They show as [hidden].

const HIDDEN = /password|hash|secret/i;
const HIDDEN_TEXT = '[hidden]';
const KINDS = "('BASE TABLE', 'VIEW')";

function intParam(value, fallback, min, max, label) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`);
  return n;
}

// Every table and view in the park database. approxRows is MySQL's estimate (views have none).
route(
  'GET',
  '/api/admin/tables',
  adminOnly(async () => {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS approxRows
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE IN ${KINDS}
        ORDER BY TABLE_TYPE, TABLE_NAME`,
    );
    return rows.map((r) => ({
      name: r.name,
      type: r.type === 'VIEW' ? 'view' : 'table',
      approxRows: r.type === 'VIEW' ? null : r.approxRows,
    }));
  }),
);

// One page of one table. ?page=1&size=25&sort=<column>&dir=asc|desc
route(
  'GET',
  '/api/admin/tables/:name',
  adminOnly(async (ctx) => {
    const [found] = await pool.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND TABLE_TYPE IN ${KINDS}`,
      [ctx.params.name],
    );
    if (found.length === 0) throw new HttpError(404, 'Table not found');
    const table = found[0].name; // the real name from the database, not the browser's text

    const [colRows] = await pool.query(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_KEY AS keyType, (IS_NULLABLE = 'YES') AS nullable, EXTRA AS extra
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [table],
    );
    const columns = colRows.map((c) => ({
      name: c.name,
      type: c.type,
      key: c.keyType === 'PRI',
      nullable: Boolean(c.nullable),
      auto: /auto_increment/i.test(c.extra || ''),
      generated: /generated/i.test(c.extra || ''),
      hidden: HIDDEN.test(c.name),
    }));
    const primaryKey = columns.filter((c) => c.key).map((c) => c.name);
    const visible = columns.filter((c) => !c.hidden).map((c) => c.name);

    const page = intParam(ctx.query.page, 1, 1, 1000000, 'Page');
    const size = intParam(ctx.query.size, 25, 1, 200, 'Page size');
    const dir = ctx.query.dir === undefined ? 'asc' : String(ctx.query.dir).toLowerCase();
    if (dir !== 'asc' && dir !== 'desc') throw new HttpError(400, 'Direction must be asc or desc');

    let sort = null;
    if (ctx.query.sort !== undefined && ctx.query.sort !== '') {
      const col = columns.find((c) => c.name === ctx.query.sort);
      if (!col) throw new HttpError(400, 'Sort column does not exist in this table');
      if (col.hidden) throw new HttpError(400, 'That column is hidden and cannot be sorted');
      sort = col.name;
    }

    // Sort by the chosen column, then by the primary key so paging is stable.
    const orderCols = [];
    const orderParts = [];
    if (sort) {
      orderCols.push(sort);
      orderParts.push(`?? ${dir.toUpperCase()}`);
    }
    for (const pk of primaryKey) {
      if (pk === sort) continue;
      orderCols.push(pk);
      orderParts.push('?? ASC');
    }
    const orderSql = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';

    const [[{ n: total }]] = await pool.query('SELECT COUNT(*) AS n FROM ??', [table]);

    let rows = [];
    if (visible.length > 0) {
      [rows] = await pool.query(`SELECT ?? FROM ??${orderSql} LIMIT ? OFFSET ?`, [
        visible,
        table,
        ...orderCols,
        size,
        (page - 1) * size,
      ]);
    }
    for (const c of columns) {
      if (c.hidden) for (const r of rows) r[c.name] = HIDDEN_TEXT;
    }

    return {
      name: table,
      type: found[0].type === 'VIEW' ? 'view' : 'table',
      columns,
      primaryKey,
      page,
      size,
      total,
      pages: Math.max(1, Math.ceil(total / size)),
      sort,
      dir,
      rows,
    };
  }),
);

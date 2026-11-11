import crypto from 'node:crypto';
import { format } from 'mysql2';
import { pool } from './db.js';
import { HttpError } from './errors.js';

// Report engine. One place builds the SQL for a report, runs it, and hands back the SQL it ran as evidence.
//
//   The request is DATA, never SQL:  { filters: [{ column, ... }], columns?, groupBy?, bucket?, measures?, sort?, dir?, limit? }
//   Sources come from the whitelist in routes/reports.js (a view name, or a fixed SQL text kept in that file).
//   Every column is looked up in information_schema (or the fixed column list) and only the real names are used,
//   as ?? identifiers. Operators come from the kind of column. Values are always bound, never pasted into the SQL.
//   The statement runs inside START TRANSACTION READ ONLY (always rolled back) with a time limit.
//
//   The response carries `evidence`: the exact statement that ran (with ? and with the values filled in),
//   the bound values, the row count, the run time and a hash of the rows. The page shows it under "How this was calculated".

// Reports return every matching row. There is no row cap (the time limit below still protects the database).
export const ROW_LIMITS = [];
export const DEFAULT_LIMIT = null;
export const SUGGEST_CAP = 500; // the name search box offers up to this many names in its drop-down

const TIMEOUT_MS = 15000;
const HIDDEN = /password|hash|secret/i;
const MAX_FILTERS = 12;
const MAX_IN = 60;
const MAX_TEXT = 60;
const MAX_MEASURES = 4;
const OPTION_CAP = 60; // a text column with more distinct values than this is searched with "contains" instead of a list
const CACHE_MS = 5 * 60 * 1000;
const FNS = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' };
const BUCKETS = { day: 'DATE(??)', month: "DATE_FORMAT(??, '%Y-%m')", year: "DATE_FORMAT(??, '%Y')" };

const bad = (msg) => new HttpError(400, msg);

// ---------- running a statement ----------

// A SELECT, run read only with a time limit. Rows come back as objects. Used by reports and by the saved queries.
export async function runSelect(sql, params = []) {
  const conn = await pool.getConnection();
  let broken = false;
  const started = Date.now();
  try {
    await conn.query('SET SESSION max_execution_time = ?', [TIMEOUT_MS]);
    await conn.query('START TRANSACTION READ ONLY');
    let rows;
    try {
      [rows] = await conn.query({ sql, values: params });
    } finally {
      await conn.query('ROLLBACK').catch(() => {
        broken = true;
      });
    }
    return { rows, ms: Date.now() - started };
  } catch (err) {
    if (err?.errno === 3024) throw new HttpError(504, 'That took too long. Narrow the filters (for example a shorter date range) and run it again.');
    throw err;
  } finally {
    await conn.query('SET SESSION max_execution_time = 0').catch(() => {
      broken = true;
    });
    if (broken) conn.destroy();
    else conn.release();
  }
}

export const hashRows = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);

// The proof that goes back with every run.
export function makeEvidence({ source, sql, params, rows, ms, limit = null, truncated = false, spec = null, rules = [] }) {
  return {
    source,
    sql: format(sql, params), // the statement with the values filled in: paste it into any MySQL client
    template: sql, // the statement as sent, with ? where a value is bound
    params,
    rules, // fixed conditions the report always applies (for example: days after today are left out)
    spec,
    rowCount: rows.length,
    limit,
    truncated,
    ms,
    hash: hashRows(rows),
    ranAt: new Date().toISOString(),
  };
}

// ---------- what a source looks like ----------

const kindOf = (type, columnType) => {
  const t = String(type).toLowerCase();
  if (['date', 'datetime', 'timestamp'].includes(t)) return 'date';
  if (t === 'bit' || (t === 'tinyint' && /\(1\)/.test(String(columnType)))) return 'flag';
  if (['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'numeric', 'float', 'double'].includes(t)) return 'number';
  if (['char', 'varchar', 'enum', 'set', 'text', 'tinytext', 'mediumtext'].includes(t)) return 'text';
  return 'other';
};

// FROM clause of a source. A view is a ?? identifier; a report written as SQL text (see routes/reports.js) is a derived table.
const fromOf = (report) => (report.sql ? { from: `(${report.sql}) AS src`, params: [] } : { from: '??', params: [report.view] });

const metaCache = new Map();
const optionCache = new Map();

// The visible columns of a report source: [{ name, kind }]. Cached for a few minutes (views do not change while the app runs).
export async function describeSource(name, report) {
  const hit = metaCache.get(name);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.columns;
  let columns;
  if (report.sqlColumns) {
    columns = report.sqlColumns.map((c) => ({ name: c.name, kind: c.kind }));
  } else {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_TYPE AS columnType
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [report.view],
    );
    columns = rows.map((c) => ({ name: c.name, kind: kindOf(c.type, c.columnType) }));
  }
  columns = columns.filter((c) => !HIDDEN.test(c.name));
  if (columns.length === 0) throw new HttpError(404, 'This report is not available yet');
  metaCache.set(name, { at: Date.now(), columns });
  return columns;
}

// The rules a report always applies, in plain words (shown next to the SQL).
export function fixedRules(report) {
  const rules = [];
  if (report.dropFuture) rules.push(`Days after today are left out (${report.dropFuture} <= CURDATE()). Tickets booked ahead are pre-orders, not revenue.`);
  if (report.preorder) {
    const blank = (report.blank ?? []).join(' and ');
    rules.push(`Days after today are kept as pre-orders (PreOrdered = 1)${blank ? ` and ${blank} is left blank for them` : ''}. Only the booking count is real.`);
  }
  return rules;
}

// Distinct values of one text column, for the check-box list. null = too many to list.
export async function columnOptions(name, report, column, cap = OPTION_CAP) {
  const meta = await describeSource(name, report);
  const col = meta.find((c) => c.name === column);
  if (!col || col.kind !== 'text') throw bad(`"${String(column).slice(0, 60)}" is not a text column of this report`);
  const key = `${name}/${col.name}/${cap}`;
  const hit = optionCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.values;
  const src = fromOf(report);
  const { rows } = await runSelect(`SELECT DISTINCT ?? AS v FROM ${src.from} WHERE ?? IS NOT NULL ORDER BY ?? LIMIT ${cap + 1}`, [col.name, ...src.params, col.name, col.name]);
  const values = rows.length > cap ? null : rows.map((r) => String(r.v));
  optionCache.set(key, { at: Date.now(), values });
  return values;
}

// ---------- reading the request ----------

function realDate(v, label) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw bad(`${label} must look like 2026-07-31`);
  return v;
}

function realNumber(v, label) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${label} must be a number`);
  return n;
}

const given = (v) => v !== undefined && v !== null && v !== '';

// One filter -> { sql, params } and the cleaned copy that goes into the evidence.
function readFilter(f, i, byName) {
  const label = `Filter ${i + 1}`;
  if (f === null || typeof f !== 'object' || Array.isArray(f)) throw bad(`${label} must be an object`);
  const col = typeof f.column === 'string' ? byName.get(f.column) : undefined;
  if (!col) throw bad(`${label}: "${String(f.column).slice(0, 60)}" is not a column of this report`);
  const c = col.name;

  if (col.kind === 'date') {
    const from = given(f.from) ? realDate(f.from, `${label} from`) : null;
    const to = given(f.to) ? realDate(f.to, `${label} to`) : null;
    if (!from && !to) throw bad(`${label}: pick a start date, an end date, or both`);
    if (from && to && from > to) throw bad(`${label}: the start date is after the end date`);
    const parts = [];
    const params = [];
    if (from) { parts.push('?? >= CAST(? AS DATE)'); params.push(c, from); }
    if (to) { parts.push('?? < DATE_ADD(CAST(? AS DATE), INTERVAL 1 DAY)'); params.push(c, to); }
    return { sql: parts.join(' AND '), params, clean: { column: c, from, to } };
  }
  if (col.kind === 'number') {
    const min = given(f.min) ? realNumber(f.min, `${label} minimum`) : null;
    const max = given(f.max) ? realNumber(f.max, `${label} maximum`) : null;
    if (min === null && max === null) throw bad(`${label}: give a minimum, a maximum, or both`);
    if (min !== null && max !== null && min > max) throw bad(`${label}: the minimum is above the maximum`);
    const parts = [];
    const params = [];
    if (min !== null) { parts.push('?? >= ?'); params.push(c, min); }
    if (max !== null) { parts.push('?? <= ?'); params.push(c, max); }
    return { sql: parts.join(' AND '), params, clean: { column: c, min, max } };
  }
  if (col.kind === 'flag') {
    const v = f.value === true || f.value === 1 || f.value === '1' ? 1 : f.value === false || f.value === 0 || f.value === '0' ? 0 : null;
    if (v === null) throw bad(`${label}: choose yes or no`);
    return { sql: '?? = ?', params: [c, v], clean: { column: c, value: v } };
  }
  if (col.kind === 'text') {
    if (Array.isArray(f.values)) {
      if (f.values.length === 0 || f.values.length > MAX_IN) throw bad(`${label}: choose 1 to ${MAX_IN} values`);
      const values = f.values.map((v) => {
        if (typeof v !== 'string' || v.length > 200) throw bad(`${label}: each value must be text of 200 characters or fewer`);
        return v;
      });
      return { sql: '?? IN (?)', params: [c, values], clean: { column: c, values } };
    }
    if (typeof f.contains === 'string' && f.contains.trim() !== '') {
      const text = f.contains.trim();
      if (text.length > MAX_TEXT) throw bad(`${label}: search text must be ${MAX_TEXT} characters or fewer`);
      return { sql: '?? LIKE ?', params: [c, `%${text.replace(/[\\%_]/g, '\\$&')}%`], clean: { column: c, contains: text } };
    }
    throw bad(`${label}: choose values, or type something to search for`);
  }
  throw bad(`${label}: ${c} cannot be filtered`);
}

// Turns a request into one statement. Throws a 400 for anything that is not on the whitelist.
export function buildQuery(report, meta, spec = {}) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw bad('The request must be an object');
  const byName = new Map(meta.map((c) => [c.name, c]));
  const colOf = (name, label) => {
    const col = typeof name === 'string' ? byName.get(name) : undefined;
    if (!col) throw bad(`${label} "${String(name).slice(0, 60)}" is not a column of this report`);
    return col;
  };

  // limit
  // No row cap: every matching row is returned. A `limit` sent by an old client is ignored.
  const limit = null;

  // filters
  const rawFilters = spec.filters ?? [];
  if (!Array.isArray(rawFilters)) throw bad('Filters must be a list');
  if (rawFilters.length > MAX_FILTERS) throw bad(`Use ${MAX_FILTERS} filters or fewer`);
  const used = new Set();
  const where = [];
  const whereParams = [];
  const cleanFilters = [];
  rawFilters.forEach((f, i) => {
    const one = readFilter(f, i, byName);
    if (used.has(one.clean.column)) throw bad(`Filter ${i + 1}: ${one.clean.column} is already filtered`);
    used.add(one.clean.column);
    where.push(one.sql);
    whereParams.push(...one.params);
    cleanFilters.push(one.clean);
  });

  const src = fromOf(report);
  const grouped = given(spec.groupBy);
  const cleanSpec = { filters: cleanFilters, limit };

  // Rules every run follows (see fixedRules). In a summary a pre-order day is left out, as the page always did.
  const futureCol = report.dropFuture ?? (grouped ? report.preorder : null);
  if (futureCol && byName.has(futureCol)) {
    where.push('?? <= CURDATE()');
    whereParams.push(futureCol);
  }
  const whereSql = where.length ? ` WHERE ${where.map((w) => `(${w})`).join(' AND ')}` : '';

  let selectSql;
  const selectParams = [];
  let groupSql = '';
  const groupParams = [];
  let output; // column names the result has, in order

  if (!grouped) {
    // Detail: the rows of the source. Nothing chosen = every visible column, listed by name (never SELECT *).
    let names;
    if (given(spec.columns) && !(Array.isArray(spec.columns) && spec.columns.length === 0)) {
      if (!Array.isArray(spec.columns)) throw bad('Columns must be a list');
      names = [...new Set(spec.columns.map((c) => colOf(c, 'Column').name))];
      cleanSpec.columns = names;
    } else {
      names = meta.map((c) => c.name);
    }
    const blank = new Set(report.preorder ? (report.blank ?? []) : []);
    const items = names.map((n) => {
      if (blank.has(n) && byName.has(report.preorder)) {
        selectParams.push(report.preorder, n, n);
        return 'IF(?? > CURDATE(), NULL, ??) AS ??';
      }
      selectParams.push(n);
      return '??';
    });
    output = [...names];
    if (report.preorder && byName.has(report.preorder) && !cleanSpec.columns) {
      items.push('IF(?? > CURDATE(), 1, 0) AS ??');
      selectParams.push(report.preorder, 'PreOrdered');
      output.push('PreOrdered');
    }
    selectSql = items.join(', ');
  } else {
    // Summary: one group column (dates can be grouped by day, month or year) and up to a few measures.
    const g = colOf(spec.groupBy, 'Group by');
    let groupOut = g.name;
    let groupExpr = '??';
    const gParams = [g.name];
    if (g.kind === 'date') {
      const bucket = given(spec.bucket) ? String(spec.bucket) : 'month';
      if (!Object.hasOwn(BUCKETS, bucket)) throw bad('Bucket must be day, month or year');
      groupExpr = BUCKETS[bucket];
      groupOut = `${g.name} (${bucket})`;
      cleanSpec.bucket = bucket;
    } else if (g.kind === 'other') {
      throw bad(`${g.name} cannot be grouped`);
    }
    cleanSpec.groupBy = g.name;
    const items = [`${groupExpr} AS ??`];
    selectParams.push(...gParams, groupOut);
    output = [groupOut];
    const rawMeasures = spec.measures ?? [{ fn: 'count' }];
    if (!Array.isArray(rawMeasures) || rawMeasures.length === 0 || rawMeasures.length > MAX_MEASURES) throw bad(`Use 1 to ${MAX_MEASURES} measures`);
    const cleanMeasures = [];
    for (const [i, m] of rawMeasures.entries()) {
      const label = `Measure ${i + 1}`;
      if (m === null || typeof m !== 'object') throw bad(`${label} must be an object`);
      if (m.fn === 'count') {
        items.push('COUNT(*) AS ??');
        selectParams.push('Rows');
        output.push('Rows');
        cleanMeasures.push({ fn: 'count' });
        continue;
      }
      if (typeof m.fn !== 'string' || !Object.hasOwn(FNS, m.fn)) throw bad(`${label}: function must be count, sum, avg, min or max`);
      const mc = colOf(m.column, `${label} column`);
      if (mc.kind !== 'number' && mc.kind !== 'flag') throw bad(`${label}: ${mc.name} is not a number`);
      const alias = `${m.fn} of ${mc.name}`;
      if (output.includes(alias)) throw bad(`${label}: ${alias} is already chosen`);
      items.push(`${FNS[m.fn]}(??) AS ??`);
      selectParams.push(mc.name, alias);
      output.push(alias);
      cleanMeasures.push({ fn: m.fn, column: mc.name });
    }
    cleanSpec.measures = cleanMeasures;
    selectSql = items.join(', ');
    groupSql = ' GROUP BY ??';
    groupParams.push(groupOut);
  }

  // Sort. Always ends with every output column, so the same request always returns the rows in the same order
  // (that is what makes the result hash repeatable).
  let dir = 'ASC';
  let first = null;
  if (given(spec.sort)) {
    if (!output.includes(spec.sort)) throw bad(`Sort column "${String(spec.sort).slice(0, 60)}" is not in the result`);
    first = spec.sort;
    dir = given(spec.dir) ? String(spec.dir).toUpperCase() : 'ASC';
    if (dir !== 'ASC' && dir !== 'DESC') throw bad('Direction must be asc or desc');
    cleanSpec.sort = first;
    cleanSpec.dir = dir.toLowerCase();
  }
  const orderCols = first ? [first, ...output.filter((c) => c !== first)] : output;
  const orderSql = ` ORDER BY ${orderCols.map((c, i) => (i === 0 && first ? `?? ${dir}` : '??')).join(', ')}`;

  const sql = `SELECT ${selectSql} FROM ${src.from}${whereSql}${groupSql}${orderSql}`;
  const params = [...selectParams, ...src.params, ...whereParams, ...groupParams, ...orderCols];
  return { sql, params, limit, spec: cleanSpec, output };
}

// Build, run, and return rows plus evidence.
export async function runReport(name, report, spec = {}) {
  const meta = await describeSource(name, report);
  const q = buildQuery(report, meta, spec);
  const { rows: all, ms } = await runSelect(q.sql, q.params);
  const truncated = false;
  const rows = all;
  return {
    rows,
    evidence: makeEvidence({ source: report.view ?? name, sql: q.sql, params: q.params, rows, ms, limit: q.limit, truncated, spec: q.spec, rules: fixedRules(report) }),
  };
}

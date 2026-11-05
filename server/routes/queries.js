import { promises as fs } from 'node:fs';
import path from 'node:path';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

const QUERY_DIR = process.env.QUERY_DIR
  ? path.resolve(process.env.QUERY_DIR)
  : path.resolve(import.meta.dirname, '..', '..', 'SQL', 'queries');

// Date defaults are worked out per request: the range starts at the first recorded data and ends today.
// Nothing after today is ever reported (tickets booked ahead are Pre-ordered, not revenue), so an end date in the future is cut back to today.
const START = { name: 'start', label: 'Start date', type: 'date', default: '2000-01-01' };
const END = { name: 'end', label: 'End date', type: 'date', default: '2099-12-31' };

async function dateDefaults() {
  const [[row]] = await pool.query(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
            DATE_FORMAT(LEAST(
              COALESCE((SELECT MIN(VisitDate) FROM Ticket), '9999-12-31'),
              COALESCE((SELECT MIN(StartDate) FROM Membership), '9999-12-31'),
              COALESCE((SELECT DATE(MIN(PurchasedAt)) FROM Purchase), '9999-12-31'),
              COALESCE((SELECT DATE(MIN(LoggedAt)) FROM RideLog), '9999-12-31'),
              COALESCE((SELECT DATE(MIN(StartDate)) FROM Maintenance), '9999-12-31')
            ), '%Y-%m-%d') AS first`,
  );
  return { today: row.today, first: row.first === '9999-12-31' ? row.today : row.first };
}

// The query's parameters with today's defaults filled in.
const withDefaults = (params, d) =>
  params.map((p) => (p === START ? { ...p, default: d.first } : p === END ? { ...p, default: d.today } : p));

// Whitelist. `bind` lists, in order, which parameter fills each ? in the .sql file.
const QUERIES = {
  q1: { title: 'Q1 Revenue by membership tier', file: 'q1.sql', params: [START, END], bind: ['start', 'end', 'start', 'end'] },
  q2: { title: 'Q2 Busiest rides', file: 'q2.sql', params: [START, END], bind: ['start', 'end'] },
  q3: { title: 'Q3 Maintenance downtime per ride', file: 'q3.sql', params: [START, END], bind: ['start', 'end', 'end', 'start'] },
  q4: {
    title: 'Q4 Best-selling items per venue',
    file: 'q4.sql',
    params: [{ name: 'venue', label: 'Venue ID (0 = all)', type: 'number', default: 0 }, START, END],
    bind: ['venue', 'venue', 'start', 'end'],
  },
  q5: {
    title: 'Q5 Memberships expiring soon',
    file: 'q5.sql',
    params: [{ name: 'days', label: 'Days ahead', type: 'number', default: 30 }],
    bind: ['days'],
  },
};

function readParam(def, raw) {
  const value = raw === undefined || raw === '' ? String(def.default) : String(raw);
  if (def.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${def.label} must look like 2026-07-31`);
    return value;
  }
  if (!/^\d{1,6}$/.test(value)) throw new HttpError(400, `${def.label} must be a whole number`);
  return Number(value);
}

route(
  'GET',
  '/api/queries',
  requireRole('Admin')(async () => {
    const d = await dateDefaults();
    return Object.entries(QUERIES).map(([id, q]) => ({ id, title: q.title, params: withDefaults(q.params, d) }));
  }),
);

route(
  'GET',
  '/api/queries/:id',
  requireRole('Admin')(async (ctx) => {
    const q = Object.hasOwn(QUERIES, ctx.params.id) ? QUERIES[ctx.params.id] : null;
    if (!q) throw new HttpError(404, 'Unknown query');

    const d = await dateDefaults();
    const values = {};
    for (const def of withDefaults(q.params, d)) values[def.name] = readParam(def, ctx.query[def.name]);
    if (values.end > d.today) values.end = d.today; // no future dates: those are Pre-orders, not results

    const sql = await fs.readFile(path.join(QUERY_DIR, q.file), 'utf8');
    const [rows] = await pool.query(
      sql,
      q.bind.map((name) => values[name]),
    );
    return rows;
  }),
);

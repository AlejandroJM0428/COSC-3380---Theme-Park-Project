import { promises as fs } from 'node:fs';
import path from 'node:path';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { makeEvidence, runSelect } from '../reportQuery.js';
import { audit } from './admin.js';

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

// Who may run which query. The five queries are shown INSIDE the reports (as tabs), so each one uses the same
// role lists as the report it sits in (server/routes/reports.js and client/src/config/reports.js).
const RETAIL = ['Admin', 'RetailManager'];
const OPERATIONS = ['Admin', 'Manager'];
const MAINTENANCE = ['Admin', 'MaintenanceManager'];
const ANY_REPORT_ROLE = ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager']; // gets past the door; the query's own list decides

// A drop-down instead of a typed number: the page shows `label`, the query receives `value`.
const DAY_CHOICES = [30, 60, 90, 180, 365].map((n) => ({ value: n, label: `${n} days` }));

// Whitelist. `bind` lists, in order, which parameter fills each ? in the .sql file.
const QUERIES = {
  q1: { title: 'Q1 Revenue by membership tier', file: 'q1.sql', roles: RETAIL, params: [START, END], bind: ['start', 'end', 'start', 'end'] },
  q2: { title: 'Q2 Busiest rides', file: 'q2.sql', roles: OPERATIONS, params: [START, END], bind: ['start', 'end'] },
  q3: { title: 'Q3 Maintenance downtime per ride', file: 'q3.sql', roles: MAINTENANCE, params: [START, END], bind: ['start', 'end', 'end', 'start'] },
  q4: {
    title: 'Q4 Best-selling items per venue',
    file: 'q4.sql',
    roles: RETAIL,
    params: [{ name: 'venue', label: 'Venue', type: 'number', default: 0, choices: 'venues' }, START, END],
    bind: ['venue', 'venue', 'start', 'end'],
  },
  q5: {
    title: 'Q5 Memberships expiring soon',
    file: 'q5.sql',
    roles: RETAIL,
    params: [{ name: 'days', label: 'Expiring within', type: 'number', default: 30, choices: DAY_CHOICES }],
    bind: ['days'],
  },
};

// Fills in `choices` for the drop-downs. 'venues' is read from the Venue table (0 = every venue).
async function withChoices(params) {
  const out = [];
  for (const p of params) {
    if (p.choices === 'venues') {
      const [rows] = await pool.query('SELECT VenueID, VenueName FROM Venue ORDER BY VenueName');
      out.push({ ...p, choices: [{ value: 0, label: 'All venues' }, ...rows.map((r) => ({ value: r.VenueID, label: r.VenueName }))] });
    } else out.push(p);
  }
  return out;
}

function readParam(def, raw) {
  const value = raw === undefined || raw === '' ? String(def.default) : String(raw);
  if (def.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${def.label} must look like 2026-07-31`);
    return value;
  }
  if (!/^\d{1,6}$/.test(value)) throw new HttpError(400, `${def.label} must be a whole number`);
  return Number(value);
}

// The queries this role may run, with their parameters (and today's defaults) for the page to draw.
route(
  'GET',
  '/api/queries',
  requireRole(...ANY_REPORT_ROLE)(async (ctx) => {
    const d = await dateDefaults();
    const mine = Object.entries(QUERIES).filter(([, q]) => q.roles.includes(ctx.session.role));
    return Promise.all(mine.map(async ([id, q]) => ({ id, title: q.title, params: await withChoices(withDefaults(q.params, d)) })));
  }),
);

route(
  'GET',
  '/api/queries/:id',
  requireRole(...ANY_REPORT_ROLE)(async (ctx) => {
    const q = Object.hasOwn(QUERIES, ctx.params.id) ? QUERIES[ctx.params.id] : null;
    if (!q) throw new HttpError(404, 'Unknown query');
    if (!q.roles.includes(ctx.session.role)) throw new HttpError(403, 'Your role cannot open this report');

    const d = await dateDefaults();
    const values = {};
    for (const def of withDefaults(q.params, d)) values[def.name] = readParam(def, ctx.query[def.name]);
    if (values.end > d.today) values.end = d.today; // no future dates: those are Pre-orders, not results

    // Runs read only with a time limit. The SQL file is returned with the values filled in, so the page can show exactly what ran.
    const sql = (await fs.readFile(path.join(QUERY_DIR, q.file), 'utf8')).trim();
    const args = q.bind.map((name) => values[name]);
    const { rows, ms } = await runSelect(sql, args);
    const evidence = makeEvidence({ source: q.file, sql, params: args, rows, ms });
    // Same record as a report run (AdminAudit, action REPORT_RUN). A failed audit write never blocks the result.
    await audit(ctx, 'REPORT_RUN', {
      table: q.file,
      detail: { query: ctx.params.id, rows: evidence.rowCount, ms: evidence.ms, hash: evidence.hash, values },
    }).catch((err) => console.error('Query audit write failed:', err.message));
    return { rows, evidence };
  }),
);

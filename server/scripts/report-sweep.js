// Report sweep: logs in as every seeded role and hits every report and saved query.
// Run from the project root, with the stack up, on the machine that has node (not inside Docker):
//   set -a; source .env; set +a; node server/scripts/report-sweep.js
// Checks, for every visible report in client/src/config/reports.js:
//   1. The server allows exactly the roles the report lists (200 vs 403). A mismatch means the two lists drifted.
//   2. The endpoint answers 200 for an allowed role and has rows.
//   3. Every column, filter, date filter and chart field the report uses exists in the rows it gets.
//   4. The report's own prepare / kpis / chartRows code runs without throwing and shows no NaN.
// Passwords come from the SEED_*_PASSWORD variables in .env. A role without one is skipped.
import { REPORTS } from '../../client/src/config/reports.js';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';

const ACCOUNTS = [
  ['admin', 'Admin', 'SEED_ADMIN_PASSWORD'],
  ['manager', 'Manager', 'SEED_MANAGER_PASSWORD'],
  ['cashier', 'Cashier', 'SEED_CASHIER_PASSWORD'],
  ['retail', 'RetailManager', 'SEED_RETAIL_PASSWORD'],
  ['hr', 'HRManager', 'SEED_HR_PASSWORD'],
  ['maintmgr', 'MaintenanceManager', 'SEED_MAINTMGR_PASSWORD'],
  ['tech', 'MaintenanceWorker', 'SEED_TECH_PASSWORD'],
  ['cook', 'RestaurantWorker', 'SEED_COOK_PASSWORD'],
];

const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

async function call(path, cookie, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body, res };
}

async function login(username, password) {
  const { status, body, res } = await call('/api/auth/login', null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (status !== 200) return { error: `login ${status} ${body?.message ?? ''}`.trim() };
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { cookie, role: body.role };
}

// Fields a report needs to find in its rows.
// A merged report has one tab per entry in `sections`; each tab is checked like a report of its own.
const CHECKS = REPORTS.flatMap((r) =>
  (r.sections ?? [r]).map((sec) => ({ ...sec, key: sec === r ? r.key : `${r.key}/${sec.key}`, roles: r.roles })),
);

function neededKeys(report) {
  const keys = new Set(report.columns ?? []);
  for (const f of report.filters ?? []) keys.add(f.key);
  if (report.dateFilter) keys.add(report.dateFilter.key);
  return keys;
}

function chartKeys(report) {
  const c = report.chart;
  return c ? [c.x, c.y, c.y2].filter(Boolean) : [];
}

function checkReportLogic(report, rows) {
  const label = `[${report.key}]`;
  let prepared = rows;
  try {
    prepared = report.prepare ? report.prepare(rows) : rows;
  } catch (e) {
    return fail(`${label} prepare() threw: ${e.message}`);
  }
  if (prepared.length === 0) return warn(`${label} no rows after prepare(), so columns and charts could not be checked`);

  const first = prepared[0];
  for (const k of neededKeys(report)) if (!(k in first)) fail(`${label} column/filter "${k}" is not in the data (has: ${Object.keys(first).join(', ')})`);

  let chartData = prepared;
  try {
    if (report.chartRows) chartData = report.chartRows(prepared);
  } catch (e) {
    return fail(`${label} chartRows() threw: ${e.message}`);
  }
  if (chartData.length > 0) {
    for (const k of chartKeys(report)) if (!(k in chartData[0])) fail(`${label} chart field "${k}" is not in the chart rows (has: ${Object.keys(chartData[0]).join(', ')})`);
  } else if (report.chart) {
    warn(`${label} chart has no rows to draw`);
  }

  try {
    const kpis = report.kpis ? report.kpis(prepared) : [];
    for (const k of kpis) if (/NaN|undefined|Infinity/.test(`${k.value} ${k.note ?? ''}`)) fail(`${label} KPI "${k.label}" shows "${k.value} ${k.note ?? ''}"`);
  } catch (e) {
    fail(`${label} kpis() threw: ${e.message}`);
  }
  if (report.tableRows) {
    try {
      const table = report.tableRows(prepared);
      for (const k of report.columns ?? []) if (table.length > 0 && !(k in table[0])) fail(`${label} table column "${k}" is not in the table rows (has: ${Object.keys(table[0]).join(', ')})`);
      if (JSON.stringify(table).match(/NaN|undefined|Infinity/)) fail(`${label} table rows contain NaN or undefined`);
    } catch (e) {
      fail(`${label} tableRows() threw: ${e.message}`);
    }
  }
  if (report.extraChart) {
    try {
      const extra = report.extraChart.rows(prepared);
      for (const k of [report.extraChart.chart.x, report.extraChart.chart.y]) if (extra.length > 0 && !(k in extra[0])) fail(`${label} second chart field "${k}" is not in its rows`);
    } catch (e) {
      fail(`${label} extraChart rows() threw: ${e.message}`);
    }
  }
  if (report.summary) {
    try {
      const text = report.summary(prepared);
      if (/NaN|undefined/.test(String(text))) fail(`${label} summary shows "${text}"`);
    } catch (e) {
      fail(`${label} summary() threw: ${e.message}`);
    }
  }
}

async function main() {
  console.log(`Report sweep against ${BASE}\n`);
  const sessions = [];
  for (const [username, role, envName] of ACCOUNTS) {
    const password = process.env[envName];
    if (!password) {
      console.log(`  skip ${username.padEnd(9)} (${envName} not set)`);
      continue;
    }
    const s = await login(username, password);
    if (s.error) {
      fail(`login as ${username}: ${s.error}`);
      console.log(`  FAIL ${username.padEnd(9)} ${s.error}`);
      continue;
    }
    if (s.role !== role) fail(`login as ${username}: expected role ${role}, got ${s.role}`);
    console.log(`  ok   ${username.padEnd(9)} logged in as ${s.role}`);
    sessions.push({ username, role: s.role, cookie: s.cookie });
  }
  if (sessions.length === 0) {
    console.log('\nNo logins worked. Is the stack up, and did you run: set -a; source .env; set +a');
    process.exit(2);
  }

  console.log(`\n${REPORTS.length} visible reports (${CHECKS.length} tabs or pages) x ${sessions.length} roles\n`);
  const checkedData = new Set();
  for (const report of CHECKS) {
    const cells = [];
    for (const s of sessions) {
      const should = report.roles.includes(s.role);
      const { status, body } = await call(`/api/reports/${report.endpoint}`, s.cookie);
      const allowed = status === 200;
      let mark = allowed ? 'OK ' : status === 403 ? '-- ' : `${status}`;
      if (should && !allowed) {
        fail(`[${report.key}] ${s.username} (${s.role}) should open it but got ${status}: ${body?.message ?? ''}`);
        mark = 'BAD';
      } else if (!should && allowed) {
        fail(`[${report.key}] ${s.username} (${s.role}) opened it but the client says it should not`);
        mark = 'BAD';
      }
      cells.push(`${s.username}:${mark}`);
      if (allowed && should && !checkedData.has(report.key)) {
        checkedData.add(report.key);
        if (!Array.isArray(body)) fail(`[${report.key}] expected a list of rows, got ${typeof body}`);
        else if (body.length === 0) warn(`[${report.key}] the view returned 0 rows`);
        else checkReportLogic(report, body);
      }
    }
    console.log(`${report.key.padEnd(24)} ${cells.join('  ')}`);
  }

  // Saved queries (Admin and Manager only on the server).
  const admin = sessions.find((s) => s.role === 'Admin') ?? sessions.find((s) => s.role === 'Manager');
  console.log('\nSaved queries');
  if (!admin) {
    warn('no Admin or Manager login, so the saved queries were not tested');
  } else {
    const list = await call('/api/queries', admin.cookie);
    if (list.status !== 200) fail(`GET /api/queries returned ${list.status}`);
    else {
      for (const q of list.body) {
        const r = await call(`/api/queries/${q.id}`, admin.cookie);
        if (r.status !== 200) {
          fail(`[query ${q.id}] returned ${r.status}: ${r.body?.message ?? ''}`);
          console.log(`  FAIL ${q.id}  ${q.title}`);
        } else {
          if (r.body.length === 0) warn(`[query ${q.id}] returned 0 rows with the default dates`);
          console.log(`  ok   ${q.id}  ${q.title}  (${r.body.length} rows)`);
        }
      }
      if (list.body.length < 3) fail('fewer than 3 saved queries are available');
    }
  }

  console.log(`\n${REPORTS.length >= 3 ? 'OK' : 'BAD'}: ${REPORTS.length} visible reports (the course needs at least 3)`);
  if (warnings.length) console.log(`\nWarnings (${warnings.length}):\n  - ${warnings.join('\n  - ')}`);
  if (problems.length) {
    console.log(`\nPROBLEMS (${problems.length}):\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('\nNo problems found.');
}

main().catch((e) => {
  console.error('Sweep crashed:', e.message);
  process.exit(2);
});

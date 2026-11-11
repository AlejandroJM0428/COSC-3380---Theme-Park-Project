// Verify that every report really runs off the SQL it shows.
//   cd server && node scripts/verify-reports.js            check every report with sample parameters
//   cd server && node scripts/verify-reports.js --show     also print each report's SQL and its first rows (the demonstration)
//   cd server && node scripts/verify-reports.js --only daily-attendance
//   cd server && node scripts/verify-reports.js --rows 3   how many rows --show prints (default 3)
// Needs MySQL up and server/.env filled in (the same file the server uses). It does not need the server running or a login.
//
// For each report and each sample set of parameters it:
//   1. runs the report through the same engine the page uses (server/reportQuery.js) and gets the rows plus the evidence;
//   2. opens a SECOND, separate MySQL connection and runs the SQL text from the evidence on its own, with no engine involved;
//   3. compares the row count and the fingerprint (a hash of the rows). They must be identical.
// It also feeds the engine bad input (unknown columns, SQL in a column name, a huge limit, ...) and checks every one is refused.
// A report that reads NOW() (ride availability, open maintenance) can differ if the clock ticks between steps 1 and 2: run it again.
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { pool } from '../db.js';
import { REPORTS } from '../routes/reports.js';
import { buildQuery, columnOptions, describeSource, hashRows, runReport } from '../reportQuery.js';

const args = process.argv.slice(2);
const SHOW = args.includes('--show');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const showRows = args.includes('--rows') ? Number(args[args.indexOf('--rows') + 1]) || 3 : 3;

let pass = 0;
let fail = 0;
const failures = [];

const line = (ok, text) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);

function ago(today, days) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function samplesFor(name, report, meta, today) {
  const list = [{ label: 'no parameters', spec: {} }];
  const date = meta.find((c) => c.kind === 'date');
  const num = meta.find((c) => c.kind === 'number');
  let text = null;
  let firstValue = null;
  for (const c of meta.filter((m) => m.kind === 'text')) {
    const values = await columnOptions(name, report, c.name);
    if (values && values.length > 0) {
      text = c;
      firstValue = values[0];
      break;
    }
  }
  if (date) list.push({ label: `${date.name} in the last 90 days`, spec: { filters: [{ column: date.name, from: ago(today, 90), to: today }] } });
  if (text) list.push({ label: `${text.name} = ${firstValue}`, spec: { filters: [{ column: text.name, values: [firstValue] }] } });
  if (num) list.push({ label: `sorted by ${num.name}, high to low`, spec: { sort: num.name, dir: 'desc' } });
  if (text && num) list.push({ label: `summary: count and sum of ${num.name} per ${text.name}`, spec: { groupBy: text.name, measures: [{ fn: 'count' }, { fn: 'sum', column: num.name }] } });
  if (date && num) list.push({ label: `summary: average ${num.name} per month of ${date.name}`, spec: { groupBy: date.name, bucket: 'month', measures: [{ fn: 'avg', column: num.name }] } });
  return list;
}

async function main() {
  const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  // The independent connection: same database, but nothing from the engine or the pool is shared with it.
  const raw = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    dateStrings: true,
  });

  const names = Object.keys(REPORTS).filter((n) => !only || n === only);
  if (only && names.length === 0) {
    console.error(`No report named "${only}". Names: ${Object.keys(REPORTS).join(', ')}`);
    process.exit(2);
  }

  console.log(`Database ${config.db.database} on ${config.db.host}:${config.db.port}, today is ${today}\n`);

  for (const name of names) {
    const report = REPORTS[name];
    let meta;
    try {
      meta = await describeSource(name, report);
    } catch (err) {
      fail++;
      failures.push(`${name}: cannot read the columns (${err.message})`);
      line(false, `${name}: cannot read the columns (${err.message})`);
      continue;
    }
    for (const sample of await samplesFor(name, report, meta, today)) {
      const tag = `${name}  [${sample.label}]`;
      try {
        const { rows, evidence } = await runReport(name, report, sample.spec);
        const [again] = await raw.query(evidence.sql); // the statement exactly as shown, on its own connection
        const same = again;
        const sameHash = hashRows(same);
        const ok = sameHash === evidence.hash && same.length === evidence.rowCount && rows.length === evidence.rowCount;
        if (ok) pass++;
        else {
          fail++;
          failures.push(`${tag}: the shown SQL gave ${same.length} rows / ${sameHash}, the report gave ${evidence.rowCount} rows / ${evidence.hash}`);
        }
        line(ok, `${tag}  rows=${evidence.rowCount}  ${evidence.ms}ms  fingerprint=${evidence.hash}${ok ? '' : `  (shown SQL gave ${sameHash})`}`);
        if (SHOW) {
          console.log(`\n${evidence.sql}\n`);
          if (evidence.rules.length) console.log(`  rules: ${evidence.rules.join(' | ')}`);
          console.table(rows.slice(0, showRows));
        }
      } catch (err) {
        fail++;
        failures.push(`${tag}: ${err.message}`);
        line(false, `${tag}  ${err.message}`);
      }
    }
  }

  // Bad input must be refused, never run. Uses the first report that has a view.
  if (!only) {
    const anyName = 'daily-attendance' in REPORTS ? 'daily-attendance' : names[0];
    const meta = await describeSource(anyName, REPORTS[anyName]);
    const first = meta[0].name;
    const bads = [
      ['an unknown column', { filters: [{ column: 'NoSuchColumn', values: ['x'] }] }],
      ['SQL in a column name', { sort: `${first}; DROP TABLE Ticket` }],
      ['SQL in a column name (group by)', { groupBy: `${first}\` ; DROP TABLE Ticket; -- ` }],
      ['a bad sort direction', { sort: first, dir: 'sideways' }],
      ['filters that are not a list', { filters: 'all' }],
      ['too many filters', { filters: Array.from({ length: 40 }, () => ({ column: first, values: ['x'] })) }],
      ['a date that does not exist', { filters: [{ column: first, from: '2026-02-31' }] }],
      ['an unknown function', { groupBy: first, measures: [{ fn: 'sleep', column: first }] }],
      ['a body that is not an object', 'DROP TABLE Ticket'],
    ];
    console.log('\nBad input (every line below must be refused):');
    for (const [label, spec] of bads) {
      try {
        buildQuery(REPORTS[anyName], meta, spec);
        fail++;
        failures.push(`bad input was accepted: ${label}`);
        line(false, `${label}: ACCEPTED (it must be refused)`);
      } catch (err) {
        if (err.status === 400) {
          pass++;
          line(true, `${label}: refused (${err.message})`);
        } else {
          fail++;
          failures.push(`${label}: wrong error ${err.status ?? err.message}`);
          line(false, `${label}: ${err.message}`);
        }
      }
    }
  }

  await raw.end();
  await pool.end();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(2);
});

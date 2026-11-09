import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { audit } from './admin.js';
import { DEFAULT_LIMIT, ROW_LIMITS, columnOptions, describeSource, fixedRules, runReport } from '../reportQuery.js';

// Who may open which report. Keep these lists in step with `roles` in client/src/config/reports.js.
// The server is what actually enforces access; the client only hides what you cannot open.
// Role matrix (TA fixes plan). Admin sees every report; each manager sees only the reports for their own area.
//   Operations manager: ride and weather reports, attendance.   Retail manager: revenue, membership, attendance.
//   HR manager: employee reports.                               Maintenance manager: maintenance reports.
const OPERATIONS = ['Admin', 'Manager'];
const ATTENDANCE = ['Admin', 'Manager', 'RetailManager'];
const RETAIL = ['Admin', 'RetailManager'];
const HR = ['Admin', 'HRManager'];
const MAINTENANCE = ['Admin', 'MaintenanceManager'];
const ANY_REPORT_ROLE = ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager']; // gets past the door; the report's own list decides

// Whitelist: endpoint name (what client/src/config/reports.js asks for) -> view name and allowed roles.
// SQL is never built from the URL: only a view name from this list is ever put in the query.
export const REPORTS = {
  // Future-dated data rule: a visit date after today is only ever a PRE-ORDER (a ticket booked ahead).
  //   preorder: keep those days, flag them PreOrdered = 1 and blank the revenue and fill figures (only the booking count stays).
  //   dropFuture: leave days after today out completely (revenue, spending and customer counts only cover days that have happened).
  //   sql: replaces SELECT * FROM view when the view itself cannot be told to skip future days (list its columns in sqlColumns).
  //   blank: with preorder, the columns that are left empty for a pre-order day.
  'customers-per-month': {
    view: 'v_CustomersPerMonth',
    roles: ATTENDANCE,
    sqlColumns: [ // this report runs the SQL text below, not the view, so its columns are listed here
      { name: 'VisitYear', kind: 'number' },
      { name: 'VisitMonth', kind: 'number' },
      { name: 'Customers', kind: 'number' },
    ],
    sql: `SELECT YEAR(t.VisitDate) AS VisitYear, MONTH(t.VisitDate) AS VisitMonth, COUNT(DISTINCT t.CustomerID) AS Customers
            FROM Ticket t
           WHERE t.VisitDate <= CURDATE()
             AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)
           GROUP BY YEAR(t.VisitDate), MONTH(t.VisitDate)`,
  },
  'daily-attendance': { view: 'v_DailyAttendance', roles: ATTENDANCE, preorder: 'VisitDate', blank: ['PctOfCapacity', 'TicketRevenue'] },
  'maintenance-history': { view: 'v_MaintenanceHistory', roles: MAINTENANCE },
  'ride-traffic-by-month': { view: 'v_RideTrafficByMonth', roles: OPERATIONS }, // SQL/views/18_ride_traffic_by_month.sql
  'weather-impact': { view: 'v_WeatherImpact', roles: OPERATIONS },
  'ride-availability': { view: 'v_RideAvailability', roles: OPERATIONS },
  'zone-ride-traffic': { view: 'v_ZoneRideTraffic', roles: OPERATIONS },
  'wait-time-by-ride': { view: 'v_WaitTimeByRide', roles: OPERATIONS },
  'revenue-by-source': { view: 'v_RevenueBySource', roles: RETAIL, dropFuture: 'RevenueDate' },
  'visit-spending': { view: 'v_VisitSpending', roles: RETAIL, dropFuture: 'VisitDate' },
  'membership-summary': { view: 'v_MembershipSummary', roles: RETAIL },
  'staff-by-zone': { view: 'v_StaffByZone', roles: HR },
  // New views from SQL/views/06_report_and_portal_views.sql
  'maintenance-cost': { view: 'v_MaintenanceCostByFacility', roles: MAINTENANCE },
  'open-maintenance': { view: 'v_OpenMaintenance', roles: MAINTENANCE },
  'employee-performance': { view: 'v_EmployeePerformance', roles: HR },
  'retail-sales': { view: 'v_RetailSalesByVenue', roles: RETAIL },
  // New view from SQL/views/12_report_views.sql
  'item-sales': { view: 'v_ItemSales', roles: RETAIL },
  'membership-performance': { view: 'v_MembershipPerformance', roles: RETAIL },
  'repair-impact': { view: 'v_RepairImpactEstimate', roles: MAINTENANCE },
  'ride-performance': { view: 'v_RidePerformance', roles: OPERATIONS },
};

// Rows dated after `today` are Pre-ordered (kept, but only the booking count) or dropped. See the REPORTS notes.
export function applyFutureRule(rows, report, today) {
  const key = report.preorder ?? report.dropFuture;
  const isFuture = (r) => String(r[key]).slice(0, 10) > today;
  if (report.dropFuture) return rows.filter((r) => !isFuture(r));
  return rows.map((r) =>
    isFuture(r)
      ? { ...r, PreOrdered: 1, PctOfCapacity: null, TicketRevenue: null }
      : { ...r, PreOrdered: 0 },
  );
}

route(
  'GET',
  '/api/reports/:name',
  requireRole(...ANY_REPORT_ROLE)(async (ctx) => {
    const report = Object.hasOwn(REPORTS, ctx.params.name) ? REPORTS[ctx.params.name] : null;
    if (!report) throw new HttpError(404, 'Unknown report');
    if (!report.roles.includes(ctx.session.role)) throw new HttpError(403, 'Your role cannot open this report');
    try {
      const [rows] = await pool.query(report.sql ?? `SELECT * FROM \`${report.view}\``);
      if (!report.preorder && !report.dropFuture) return rows;
      const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
      return applyFutureRule(rows, report, today);
    } catch (err) {
      if (err.errno === 1146) throw new HttpError(404, 'This report is not available yet');
      throw err;
    }
  }),
);

// ---------- parameters, run, and proof (the report page uses these) ----------

function reportFor(ctx) {
  const name = ctx.params.name;
  const report = Object.hasOwn(REPORTS, name) ? REPORTS[name] : null;
  if (!report) throw new HttpError(404, 'Unknown report');
  if (!report.roles.includes(ctx.session.role)) throw new HttpError(403, 'Your role cannot open this report');
  return { name, report };
}

// What a person can choose for this report: the columns and their kinds. Cheap (no report data is read).
route(
  'GET',
  '/api/reports/:name/params',
  requireRole(...ANY_REPORT_ROLE)(async (ctx) => {
    const { name, report } = reportFor(ctx);
    try {
      const columns = await describeSource(name, report);
      return { columns, limits: ROW_LIMITS, defaultLimit: DEFAULT_LIMIT, rules: fixedRules(report), futureColumn: report.dropFuture ?? report.preorder ?? null };
    } catch (err) {
      if (err.errno === 1146) throw new HttpError(404, 'This report is not available yet');
      throw err;
    }
  }),
);

// The values of one text column, for a check-box list. { values: null } = too many to list (use "contains").
route(
  'GET',
  '/api/reports/:name/options',
  requireRole(...ANY_REPORT_ROLE)(async (ctx) => {
    const { name, report } = reportFor(ctx);
    return { column: ctx.query.column, values: await columnOptions(name, report, ctx.query.column) };
  }),
);

// Run the report with the chosen parameters. Returns { rows, evidence }. Every run is written to AdminAudit
// (action REPORT_RUN) so there is a record of who ran what. A failed audit write never blocks the report.
route(
  'POST',
  '/api/reports/:name/run',
  requireRole(...ANY_REPORT_ROLE)(async (ctx) => {
    const { name, report } = reportFor(ctx);
    let out;
    try {
      out = await runReport(name, report, ctx.body);
    } catch (err) {
      if (err.errno === 1146) throw new HttpError(404, 'This report is not available yet');
      throw err;
    }
    const e = out.evidence;
    await audit(ctx, 'REPORT_RUN', {
      table: report.view ?? name,
      detail: { report: name, rows: e.rowCount, ms: e.ms, hash: e.hash, spec: e.spec },
    }).catch((err) => console.error('Report audit write failed:', err.message));
    return out;
  }),
);

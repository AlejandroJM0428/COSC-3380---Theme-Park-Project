import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Who may open which report. Keep these lists in step with `roles` in client/src/config/reports.js.
// The server is what actually enforces access; the client only hides what you cannot open.
const ADMINS = ['Admin', 'Manager'];
const RETAIL = [...ADMINS, 'RetailManager'];
const HR = [...ADMINS, 'HRManager'];
const MAINTENANCE = [...ADMINS, 'MaintenanceManager'];
const EVERY_MANAGER = [...ADMINS, 'RetailManager', 'HRManager', 'MaintenanceManager'];

// Whitelist: endpoint name (what client/src/config/reports.js asks for) -> view name and allowed roles.
// SQL is never built from the URL: only a view name from this list is ever put in the query.
const REPORTS = {
  'customers-per-month': { view: 'v_CustomersPerMonth', roles: RETAIL },
  'daily-attendance': { view: 'v_DailyAttendance', roles: RETAIL },
  'maintenance-history': { view: 'v_MaintenanceHistory', roles: MAINTENANCE },
  'ride-traffic-by-month': { view: 'v_RideTrafficByMonth', roles: EVERY_MANAGER }, // SQL/views_extra.sql
  'weather-impact': { view: 'v_WeatherImpact', roles: ADMINS },
  'ride-availability': { view: 'v_RideAvailability', roles: EVERY_MANAGER },
  'zone-ride-traffic': { view: 'v_ZoneRideTraffic', roles: EVERY_MANAGER },
  'wait-time-by-ride': { view: 'v_WaitTimeByRide', roles: EVERY_MANAGER },
  'revenue-by-source': { view: 'v_RevenueBySource', roles: RETAIL },
  'visit-spending': { view: 'v_VisitSpending', roles: RETAIL },
  'membership-summary': { view: 'v_MembershipSummary', roles: RETAIL },
  'staff-by-zone': { view: 'v_StaffByZone', roles: HR },
  // New views from SQL/06_report_and_portal_views.sql
  'maintenance-cost': { view: 'v_MaintenanceCostByFacility', roles: MAINTENANCE },
  'open-maintenance': { view: 'v_OpenMaintenance', roles: MAINTENANCE },
  'employee-performance': { view: 'v_EmployeePerformance', roles: HR },
  'retail-sales': { view: 'v_RetailSalesByVenue', roles: RETAIL },
};

route(
  'GET',
  '/api/reports/:name',
  requireRole(...EVERY_MANAGER)(async (ctx) => {
    const report = Object.hasOwn(REPORTS, ctx.params.name) ? REPORTS[ctx.params.name] : null;
    if (!report) throw new HttpError(404, 'Unknown report');
    if (!report.roles.includes(ctx.session.role)) throw new HttpError(403, 'Your role cannot open this report');
    try {
      const [rows] = await pool.query(`SELECT * FROM \`${report.view}\``);
      return rows;
    } catch (err) {
      if (err.errno === 1146) throw new HttpError(404, 'This report is not available yet');
      throw err;
    }
  }),
);

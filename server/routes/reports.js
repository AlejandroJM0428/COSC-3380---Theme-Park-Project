import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Whitelist: endpoint name (what client/src/config/reports.js asks for) -> view name.
// SQL is never built from the URL.
const REPORT_VIEWS = {
  'customers-per-month': 'v_CustomersPerMonth',
  'daily-attendance': 'v_DailyAttendance',
  'maintenance-history': 'v_MaintenanceHistory',
  'ride-traffic-by-month': 'v_RideTrafficByMonth', // created in Step 4 (SQL/views_extra.sql); name may change
  'weather-impact': 'v_WeatherImpact',
  'ride-availability': 'v_RideAvailability',
  'zone-ride-traffic': 'v_ZoneRideTraffic',
  'wait-time-by-ride': 'v_WaitTimeByRide',
  'revenue-by-source': 'v_RevenueBySource',
  'visit-spending': 'v_VisitSpending',
  'membership-summary': 'v_MembershipSummary',
  'staff-by-zone': 'v_StaffByZone',
};

route(
  'GET',
  '/api/reports/:name',
  requireRole('Admin', 'Manager')(async (ctx) => {
    const view = Object.hasOwn(REPORT_VIEWS, ctx.params.name) ? REPORT_VIEWS[ctx.params.name] : null;
    if (!view) throw new HttpError(404, 'Unknown report');
    try {
      const [rows] = await pool.query(`SELECT * FROM \`${view}\``);
      return rows;
    } catch (err) {
      if (err.errno === 1146) throw new HttpError(404, 'This report is not available yet');
      throw err;
    }
  }),
);

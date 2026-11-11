// Which record pages sit behind which report. The report page shows a link to each one the signed-in person may use.
// A link grants nothing: the record page and the server routes check the role again on every write.

// Admin and the four manager roles. Everyone else never sees the links.
export const EDIT_ROLES = ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager']

// report key (config/reports.js)  ->  record page paths (FORM_PAGES in config/nav.js)
export const REPORT_EDIT_PAGES = {
  revenue: ['refunds', 'purchases', 'game-plays'],
  memberships: ['memberships', 'cancellations'],
  attendance: ['refunds', 'ride-log', 'weather'],
  'maintenance-activity': ['maintenance'],
  'maintenance-cost': ['maintenance'],
  'employee-performance': ['employees'],
  'staff-by-zone': ['employees'],
  'ride-performance': ['ride-log', 'weather', 'maintenance'],
}

// Pages where the page's own role list is wider than who may write. The Manager can open Maintenance but only to view it.
export const PAGE_WRITE_ROLES = {
  maintenance: ['Admin', 'MaintenanceManager'],
}

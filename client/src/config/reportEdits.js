// Which record pages sit behind which report. The report page shows a link to each one the signed-in person may use.
// A link grants nothing: the record page and the server routes check the role again on every write.

// Admin and the four manager roles. Everyone else never sees the links.
export const EDIT_ROLES = ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager']

import { MAINTENANCE, SHIFTS } from './entities.js'
import { GAME_PLAYS, MEMBERSHIPS, PURCHASES, RIDE_LOG, WEATHER } from './entitiesMore.js'

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

// Record page path -> the entity the "Add record" menu opens in the pop-up. A page missing here has no pop-up:
// 'refunds' adds through its own Sell Ticket page (the menu links there), and the rest are not records you add from a report.
export const REPORT_ADD_ENTITIES = {
  purchases: PURCHASES,
  'game-plays': GAME_PLAYS,
  memberships: MEMBERSHIPS,
  'ride-log': RIDE_LOG,
  weather: WEATHER,
  maintenance: MAINTENANCE,
  employees: SHIFTS,
}

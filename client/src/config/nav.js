import { REPORTS } from './reports.js'

// ASSUMPTION: these role permissions are a first guess. Agree on them with your
// team (and the professor) and edit here - the menu and route guards follow this file.
export const PARK_NAME = 'Thunder Valley Adventure Park'
export const PARK_SHORT = 'Thunder Valley'

// What each role is called around the park. Shown on the staff badge and the dashboard.
export const ROLE_INFO = {
  Admin: { title: 'Control room', blurb: 'Every report, live check and setting in the park.' },
  Manager: { title: 'Operations desk', blurb: 'Reports, live checks and day-to-day records.' },
  Cashier: { title: 'Ticket booth', blurb: 'Sell tickets, take refunds and record purchases.' },
  Customer: { title: 'Customer account', blurb: 'Explore rides, manage your tickets, and view your membership' },
  RetailManager: { title: 'Retail desk', blurb: 'Sales, items and revenue across the shops and restaurants.' },
  HRManager: { title: 'People desk', blurb: 'Staff, shifts and performance.' },
  MaintenanceManager: { title: 'Maintenance desk', blurb: 'Repairs, repair costs and ride downtime.' },
  MaintenanceWorker: { title: 'Maintenance crew', blurb: 'Your repair jobs and shifts.' },
  RestaurantWorker: { title: 'Restaurant team', blurb: 'Your shifts and venue sales.' },
}

export const ALL_ROLES = ['Admin', 'Manager', 'Cashier']

// Everyone who can open the reports area. Each report lists its own roles (config/reports.js).
export const MANAGEMENT = ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager']

// Run Queries and Trigger Demos: the server only allows these two roles.
export const OPS_ROLES = ['Admin', 'Manager']

// One entry per data-entry page. `path` is the URL (/tickets), `label` is the menu text.
export const FORM_PAGES = [
  { path: 'tickets',     label: 'Sell Ticket',            roles: [...ALL_ROLES, 'RetailManager'] },
  { path: 'refunds',     label: 'Ticket Sales & Refunds', roles: [...ALL_ROLES, 'RetailManager'] },
  { path: 'purchases',   label: 'Food & Shop Purchases',  roles: ALL_ROLES },
  { path: 'game-plays',  label: 'Game Plays',             roles: ALL_ROLES },
  { path: 'customers',   label: 'Customers',              roles: ALL_ROLES },
  { path: 'memberships', label: 'Memberships',            roles: ALL_ROLES },
  { path: 'ride-log',    label: 'Ride Log',               roles: OPS_ROLES },
  { path: 'weather',     label: 'Weather Log',            roles: OPS_ROLES },
  { path: 'maintenance', label: 'Maintenance',            roles: [...OPS_ROLES, 'MaintenanceManager'] },
  { path: 'employees',   label: 'Employees & Shifts',     roles: [...OPS_ROLES, 'HRManager'] },
  { path: 'facilities',  label: 'Rides, Games & Venues',  roles: ['Admin'] },
  { path: 'users',       label: 'App Users',              roles: ['Admin'] },
]

export const NAV_SECTIONS = [
  {
    title: 'Live database',
    zone: 'var(--lagoon)',
    items: [
      { to: '/queries', label: 'Run Queries', note: 'Run a saved SQL query and see the rows.', roles: OPS_ROLES },
      { to: '/trigger-demos', label: 'Trigger Demos', note: 'Try a bad insert and read the database\'s own refusal.', roles: OPS_ROLES },
    ],
  },
  {
    title: 'Reports',
    zone: 'var(--sun)',
    items: REPORTS.map((r) => ({
      to: `/reports/${r.key}`,
      label: r.title,
      note: r.description,
      required: r.required,
      roles: r.roles ?? MANAGEMENT,
    })),
  },
  {
    title: 'Park operations',
    zone: 'var(--coral)',
    items: FORM_PAGES.map((f) => ({ to: `/${f.path}`, label: f.label, roles: f.roles })),
  },
]

import { REPORTS, REPORT_GROUPS } from './reports.js'

// ASSUMPTION: these role permissions are a first guess. Agree on them with your
// team (and the professor) and edit here - the menu and route guards follow this file.
export const PARK_NAME = 'Thunder Valley Adventure Park'
export const PARK_SHORT = 'Thunder Valley'

// What each role is called around the park. Shown on the staff badge and the dashboard.
export const ROLE_INFO = {
  Admin: { title: 'Control room', blurb: 'Staff accounts, park setup, every report and every record in the park.' },
  Manager: { title: 'Operations desk', blurb: 'Reports and day-to-day records.' },
  Cashier: { title: 'Ticket booth', blurb: 'Sell tickets, take refunds and record purchases.' },
  Customer: { title: 'Customer account', blurb: 'Explore rides, manage your tickets, and view your membership' },
  RetailManager: { title: 'Retail desk', blurb: 'Sales, items and revenue across the shops and restaurants.' },
  HRManager: { title: 'People desk', blurb: 'Staff, shifts and performance.' },
  MaintenanceManager: { title: 'Maintenance desk', blurb: 'Repairs, repair costs and ride downtime.' },
  MaintenanceWorker: { title: 'Maintenance crew', blurb: 'Your repair jobs and shifts.' },
  RestaurantWorker: { title: 'Restaurant team', blurb: 'Your shifts and venue sales.' },
}

// Everyone who may enter the staff transaction portal (Customer is NOT one of them).
export const STAFF_ROLES = Object.keys(ROLE_INFO).filter((r) => r !== 'Customer')

export const ALL_ROLES = ['Admin', 'Manager', 'Cashier']

// Everyone who can open the reports area. Each report lists its own roles (config/reports.js).
export const MANAGEMENT = ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager']

// Ride log, weather log and similar day-to-day records.
export const OPS_ROLES = ['Admin', 'Manager']

// The admin portal (/admin) is for this one role only. Everyone else is sent to /staff.
export const ADMIN_ONLY = ['Admin']

// One entry per data-entry page. `path` is the URL (/tickets), `label` is the menu text.
// `ready: true` = the page is built (it is registered in PAGE_COMPONENTS in App.jsx).
// Pages without it stay out of the menu and dashboard until someone sets the flag, so nobody lands on an empty "not built yet" page.
export const FORM_PAGES = [
  { path: 'tickets',     label: 'Sell Ticket',            roles: [...ALL_ROLES, 'RetailManager'], ready: true },
  { path: 'refunds',     label: 'Ticket Sales & Refunds', roles: [...ALL_ROLES, 'RetailManager'], ready: true },
  { path: 'purchases',   label: 'Food & Shop Purchases',  roles: [...ALL_ROLES, 'RetailManager'], ready: true },
  { path: 'game-plays',  label: 'Game Plays',             roles: [...ALL_ROLES, 'RetailManager'], ready: true },
  { path: 'customers',   label: 'Customers',              roles: [...ALL_ROLES, 'RetailManager'], ready: true },
  { path: 'memberships', label: 'Memberships',            roles: [...ALL_ROLES, 'RetailManager'], ready: true },
  { path: 'ride-log',    label: 'Ride Log',               roles: OPS_ROLES, ready: true },
  { path: 'weather',     label: 'Weather Log',            roles: OPS_ROLES, ready: true },
  { path: 'maintenance', label: 'Maintenance',            roles: [...OPS_ROLES, 'MaintenanceManager'], ready: true },
  { path: 'employees',   label: 'Shift Ratings',          roles: [...OPS_ROLES, 'HRManager'], ready: true },
  { path: 'notifications', label: 'Promos & Notices',     roles: ['Admin', 'Manager', 'RetailManager'], ready: true },
  { path: 'my-work',     label: 'My Work',                roles: ['MaintenanceWorker', 'RestaurantWorker'], ready: true },
  { path: 'facilities',  label: 'Rides, Games & Venues',  roles: ['Admin'], ready: true },
  { path: 'users',       label: 'App Users',              roles: ['Admin'], ready: true },
]

// One menu section per report group (Revenue, Maintenance, ...). Groups with no reports are skipped.
const REPORT_SECTIONS = REPORT_GROUPS.map((group) => ({
  title: group,
  zone: 'var(--sun)',
  items: REPORTS.filter((r) => r.group === group).map((r) => ({
    to: `/reports/${r.key}`,
    label: r.title,
    note: r.description,
    required: r.required,
    roles: r.roles ?? MANAGEMENT,
  })),
})).filter((s) => s.items.length > 0)

// Staff portal (/staff) menu. There is no "Live database" section any more (TA feedback: remove it).
export const NAV_SECTIONS = [
  ...REPORT_SECTIONS,
  {
    title: 'Park operations',
    zone: 'var(--coral)',
    items: FORM_PAGES.filter((f) => f.ready).map((f) => ({ to: `/${f.path}`, label: f.label, roles: f.roles })),
  },
]

// Admin portal (/admin) menu. Same pages, grouped by what an admin does. Every item is admin only.
// `to` is the path under /admin, so the page components are shared with the staff portal.
const adminItem = (to, label, note) => ({ to, label, note, roles: ADMIN_ONLY })
const formItem = (path) => {
  const f = FORM_PAGES.find((p) => p.path === path)
  return adminItem(`/${f.path}`, f.label)
}

export const ADMIN_NAV_SECTIONS = [
  {
    title: 'People & access',
    zone: 'var(--plum)',
    items: [adminItem('/users', 'Staff Accounts', 'Add logins, change roles, reset passwords, deactivate accounts.')],
  },
  {
    title: 'Park setup',
    zone: 'var(--lagoon)',
    items: [
      adminItem('/facilities', 'Rides, Games & Venues', 'Add or edit attractions, set a ride to maintenance, deactivate.'),
      formItem('notifications'),
    ],
  },
  ...REPORT_SECTIONS.map((s) => ({
    ...s,
    items: s.items.map((i) => ({ ...i, roles: ADMIN_ONLY })),
  })),
  {
    title: 'Daily records',
    zone: 'var(--coral)',
    items: ['tickets', 'refunds', 'purchases', 'game-plays', 'customers', 'memberships', 'ride-log', 'weather', 'maintenance', 'employees'].map(formItem),
  },
]

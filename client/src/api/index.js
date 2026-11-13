// Pages import from HERE, never from http.js directly.
// Whatever the team decides about how the site reaches MySQL, only this file changes.
import { http } from './http.js'

// One sign in for everyone: the answer says which kind of account it is (role), and the page picks the portal.
export function login(username, password) {
  return http('/auth/login', { method: 'POST', body: { username, password } })
}

// Who does the server think is signed in? Used once on page load, because the browser only remembers
// the user per tab but the session cookie is shared by every tab.
export function getSessionUser() {
  return http('/auth/me')
}

// Ends the server session (the cookie stops working). The page signs out on its own even if this fails.
export function logoutRequest() {
  return http('/auth/logout', { method: 'POST' })
}

// Member self sign-up. Logs the new member in (server sets the session cookie).
export function register(data) {
  return http('/auth/register', { method: 'POST', body: data })
}

export function getReport(endpoint) {
  return http(`/reports/${endpoint}`)
}

// Report parameters and proof (live database). If the parameters cannot be loaded, the report page falls back to
// filtering the rows it already has.
//   getReportParams -> { columns: [{ name, kind }], limits, defaultLimit, rules, futureColumn }   (no report data is read)
//   getReportOptions -> { column, values: [..] | null }                                          (values of one text column)
//   runReport -> { rows, evidence }                                                              (evidence = the SQL that ran, and proof)
export function getReportParams(endpoint) {
  return http(`/reports/${endpoint}/params`)
}

// all = true asks for up to 500 values (the name search drop-down) instead of the 60 the check-box list allows.
export function getReportOptions(endpoint, column, all = false) {
  return http(`/reports/${endpoint}/options?${new URLSearchParams(all ? { column, all: '1' } : { column })}`)
}

export async function runReport(endpoint, spec) {
  return http(`/reports/${endpoint}/run`, { method: 'POST', body: spec ?? {} })
}

// The tables and matching source rows behind one report line. Loaded only when that line's Details button is clicked.
// mode 'preview' (default): the totals and the first few rows, quick. mode 'all': every matching row, for the View all pop-up.
export function reportDetail(endpoint, row, range, mode = 'preview') {
  const plain = {}
  for (const [k, v] of Object.entries(row ?? {})) {
    if (k === 'Note' || k.startsWith('_')) continue
    if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') plain[k] = v
  }
  const body = { row: plain }
  if (mode === 'all') body.mode = 'all'
  if (range?.from) body.from = range.from
  if (range?.to) body.to = range.to
  return http(`/reports/${endpoint}/detail`, { method: 'POST', body })
}

export function listQueries() {
  return http('/queries')
}

export function runQuery(id, params) {
  return http(`/queries/${id}?${new URLSearchParams(params)}`)
}

export function createTicket(data) {
  return http('/tickets', { method: 'POST', body: data })
}

// Day 3+: add one function per form here, e.g.
// export function createTicket(data) { return http('/tickets', { method: 'POST', body: data }) }


// Visitor portal. Live database only: the member's name, membership and tickets come from the
// server, which looks them up with the CustomerID of the logged-in session.
export function getVisitorDashboard() {
  return http('/visitor/dashboard')
}

export function buyVisitorTicket(data) {
  return http('/visitor/tickets', { method: 'POST', body: data })
}

// Buys a membership that starts today. Send { tier, autoRenew } only: the server sets dates and price.
// Resolves to { membership, perks, firedTriggers }.
export function buyVisitorMembership(data) {
  return http('/visitor/membership', { method: 'POST', body: data })
}

export function refundVisitorTicket(ticketId) {
  return http(`/visitor/tickets/${ticketId}/refund`, { method: 'POST', body: {} })
}
export function renewVisitorMembership(data) {
  return http('/visitor/membership/renew', {
    method: 'POST',
    body: data
  })
}
export function updateVisitorProfile(data) {

  return http('/visitor/profile', {
    method: 'PUT',
    body: data
  })
}

// My Family (dependents under 18). Live database only. The server uses the CustomerID of the session and
// checks every dependent id against that parent, so these never need a parent id.
// getFamily resolves to { limit, dependents: [{ customerId, firstName, dob, age, heightCm, consentedAt, tickets[] }] }.
export function getFamily() {
  return http('/family')
}

// data: { firstName, dob (YYYY-MM-DD), heightCm, consent: true }. The parent must have ticked the consent box.
export function addDependent(data) {
  return http('/family/dependents', { method: 'POST', body: data })
}

// data: { firstName, dob, heightCm }
export function updateDependent(id, data) {
  return http(`/family/dependents/${id}`, { method: 'PUT', body: data })
}

// The row is anonymised on the server (past tickets stay for reporting). Refused while a ticket is upcoming.
export function removeDependent(id) {
  return http(`/family/dependents/${id}`, { method: 'DELETE' })
}

// What the database will charge. Saves nothing. Resolves to { dayPass, expressAddOn, discountPct, discount, total, ... }.
export function quoteDependentTicket(id, visitDate, hasExpress) {
  const qs = new URLSearchParams({ visitDate, hasExpress: hasExpress ? '1' : '0' }).toString()
  return http(`/family/dependents/${id}/quote?${qs}`)
}

// Send { visitDate, hasExpress } only. The server sets the price. Resolves to the ticket plus { discount, firedTriggers }.
export function buyDependentTicket(id, data) {
  return http(`/family/dependents/${id}/tickets`, { method: 'POST', body: data })
}

export function refundDependentTicket(ticketId) {
  return http(`/family/tickets/${ticketId}/refund`, { method: 'POST', body: {} })
}

// Membership cancellation. A request, not an instant cancel: a manager approves or rejects it.
// Resolves to { membership, canRequest, blockedReason, requests[] } for the signed-in member.
export function getMyCancellations() {
  return http('/cancellations/mine')
}

// Send { reason } only (required, 200 characters or fewer). The server picks the membership that is active today.
export function requestCancellation(reason) {
  return http('/cancellations', { method: 'POST', body: { reason } })
}

// Cancellation review (Admin and RetailManager). The server sends every request, Pending first, then newest.
// Each row: { requestId, customerName, tier, startDate, endDate, autoRenew, requestedAt, reason, status, decidedAt, decidedBy, decisionNote }.
export function listCancellations() {
  return http('/cancellations')
}

// Approving turns auto-renew off and marks the request Approved. Nothing is refunded and the end date does not change.
// note is optional (200 characters or fewer). A request that was already decided comes back as a 409 error.
export function approveCancellation(requestId, note) {
  return http(`/cancellations/${requestId}/approve`, { method: 'POST', body: { note } })
}

export function rejectCancellation(requestId, note) {
  return http(`/cancellations/${requestId}/reject`, { method: 'POST', body: { note } })
}

// Public site data for the homepage and public pages: prices, hours, membership tiers, rides
// (Open/Closed only, never wait times) and venues. No sign-in needed.
export function getPublicSite() {
  return http('/public/site')
}

// Generic data entry, used by components/RecordManager.jsx. `resource` is the API path, e.g. 'maintenance'.
export function listRecords(resource, query = {}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null))
  const qs = params.toString()
  return http(`/${resource}${qs ? `?${qs}` : ''}`)
}

export function getRecord(resource, id) {
  return http(`/${resource}/${id}`)
}

export function getLookups(resource) {
  return http(`/${resource}/lookups`)
}

export function createRecord(resource, data) {
  return http(`/${resource}`, { method: 'POST', body: data })
}

export function updateRecord(resource, id, data) {
  return http(`/${resource}/${id}`, { method: 'PUT', body: data })
}

export function deleteRecord(resource, id, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString()
  return http(`/${resource}/${id}${qs ? `?${qs}` : ''}`, { method: 'DELETE' })
}

// Turn a deactivated record back on (rides, games and venues).
export function reactivateRecord(resource, id, reason = '') {
  return http(`/${resource}/${id}/reactivate`, { method: 'POST', body: { reason } })
}

// Admin: close a ride now, or open it again (rides only). The reason is saved in the audit log.
export function setRideOpen(resource, id, open, reason) {
  return http(`/${resource}/${id}/${open ? 'reopen' : 'close'}`, { method: 'POST', body: { reason } })
}

// Employee portal (Maintenance Worker, Restaurant Worker): the server uses the EmployeeID of the session.
export function getMyWork() {
  return http('/me/work')
}

// Maintenance worker: report an open job finished ({ outcome, note }), or undo that report.
export function reportJobFinished(maintenanceId, data) {
  return http(`/me/jobs/${maintenanceId}/finished`, { method: 'POST', body: data })
}

export function undoJobFinished(maintenanceId) {
  return http(`/me/jobs/${maintenanceId}/finished`, { method: 'DELETE' })
}

// Customer lookup for the ticket forms. name and dob (YYYY-MM-DD) are each optional, but one is needed.
// browse = true lets the search run with no name and no date (the guest drop-down: first 20 by last name).
export function searchCustomers(name, dob, hasLogin = false, browse = false) {
  const qs = new URLSearchParams(Object.entries({ name, dob, hasLogin: hasLogin ? '1' : '', browse: browse ? '1' : '' }).filter(([, v]) => v)).toString()
  return http(`/customers/search?${qs}`)
}

// Notifications. The list is public (homepage).
export function listNotifications() {
  return http('/notifications')
}

export function createNotification(data) {
  return http('/notifications', { method: 'POST', body: data })
}

export function updateNotification(id, data) {
  return http(`/notifications/${id}`, { method: 'PUT', body: data })
}

// "Delete" = dismiss (IsActive = 0 on the server).
export function dismissNotification(id) {
  return http(`/notifications/${id}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Admin tools (one-page admin). Live database only, Admin role only: the server
// refuses anyone else with 403, so these are not just hidden in the UI.
// ---------------------------------------------------------------------------

function adminQuery(query = {}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// { ok, auditReady } for the admin guard check.
export function adminPing() {
  return http('/admin/ping')
}

// Newest first. query: { limit }
export function adminAudit(query = {}) {
  return http(`/admin/audit${adminQuery(query)}`)
}

// Tables and views with approximate row counts.
export function adminListTables() {
  return http('/admin/tables')
}

// One page of a table. query: { page, size, sort, dir }. Response has columns, primaryKey and rows.
export function adminBrowseTable(name, query = {}) {
  return http(`/admin/tables/${encodeURIComponent(name)}${adminQuery(query)}`)
}

// SQL console. Read mode by default. Write mode needs write: true and confirm: 'WRITE'.
// Rows come back as arrays, with a `columns` list.
export function adminRunSql(sql, { write = false, confirm } = {}) {
  const body = { sql }
  if (write) {
    body.write = true
    body.confirm = confirm
  }
  return http('/admin/sql', { method: 'POST', body })
}

// Transactions per ID. type is 'customer', 'ticket' or 'membership'.
export function adminTransactions(type, id) {
  return http(`/admin/transactions/${encodeURIComponent(type)}/${encodeURIComponent(id)}`)
}

// Row Editor. Triggers and constraints still apply, and every change is audited.
export function adminInsertRow(table, values) {
  return http(`/admin/rows/${encodeURIComponent(table)}`, { method: 'POST', body: { values } })
}

// key must name exactly the primary key columns, e.g. { CustomerID: 1 }.
export function adminUpdateRow(table, key, values) {
  return http(`/admin/rows/${encodeURIComponent(table)}`, { method: 'PUT', body: { key, values } })
}

// Delete is a POST because the server only reads a body on POST, PUT and PATCH.
export function adminDeleteRow(table, key) {
  return http(`/admin/rows/${encodeURIComponent(table)}/delete`, { method: 'POST', body: { key } })
}

// SQL GUI. spec: { table, columns?, filters?, match?, sort?, dir?, limit? }.
// Response is the console shape plus `table`, `type` and `sql`.
export function adminBuild(spec) {
  return http('/admin/builder', { method: 'POST', body: spec })
}

// Close or reopen the park for weather (Admin and the Operations desk). The database then refuses sales until it reopens
// (SQL/rules/29_sales_blocked_when_park_closed.sql).
export function getParkClosure() {
  return http('/admin/weather/park-status')
}
export function closePark(data) {
  return http('/admin/weather/close-park', { method: 'POST', body: data })
}
export function reopenPark(data) {
  return http('/admin/weather/reopen-park', { method: 'POST', body: data })
}

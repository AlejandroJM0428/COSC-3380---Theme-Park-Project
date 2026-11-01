// Pages import from HERE, never from http.js or mock.js directly.
// Whatever the team decides about how the site reaches MySQL, only this file changes.
import { http } from './http.js'
import * as mock from './mock.js'

// Mock mode is ON unless .env says VITE_USE_MOCK=false
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

// audience = 'staff' or 'member': which sign in page is asking. The server refuses the other kind of account.
export function login(username, password, audience) {
  return USE_MOCK
    ? mock.login(username, password, audience)
    : http('/auth/login', { method: 'POST', body: { username, password, audience } })
}

// Who does the server think is signed in? Used once on page load, because the browser only remembers
// the user per tab but the session cookie is shared by every tab. Mock mode has no server session.
export function getSessionUser() {
  return USE_MOCK ? Promise.resolve(null) : http('/auth/me')
}

// Member self sign-up. Logs the new member in (server sets the session cookie).
export function register(data) {
  return USE_MOCK ? mock.register(data) : http('/auth/register', { method: 'POST', body: data })
}

export function getReport(endpoint) {
  return USE_MOCK ? mock.getReport(endpoint) : http(`/reports/${endpoint}`)
}

// Live database only: these have no mock, because the point is to reach MySQL.
function needLive() {
  if (USE_MOCK) {
    throw new Error('Mock mode is on, so this would not touch the database. Set VITE_USE_MOCK=false in client/.env and restart npm run dev.')
  }
}

export function listQueries() {
  needLive()
  return http('/queries')
}

export function runQuery(id, params) {
  needLive()
  return http(`/queries/${id}?${new URLSearchParams(params)}`)
}

export function createTicket(data) {
  needLive()
  return http('/tickets', { method: 'POST', body: data })
}

// Day 3+: add one function per form here, e.g.
// export function createTicket(data) { return http('/tickets', { method: 'POST', body: data }) }


// Visitor portal. Live database only: the member's name, membership and tickets come from the
// server, which looks them up with the CustomerID of the logged-in session.
export function getVisitorDashboard() {
  needLive()
  return http('/visitor/dashboard')
}

export function buyVisitorTicket(data) {
  needLive()
  return http('/visitor/tickets', { method: 'POST', body: data })
}

// Buys a membership that starts today. Send { tier, autoRenew } only: the server sets dates and price.
// Resolves to { membership, perks, firedTriggers }.
export function buyVisitorMembership(data) {
  needLive()
  return http('/visitor/membership', { method: 'POST', body: data })
}

export function refundVisitorTicket(ticketId) {
  needLive()
  return http(`/visitor/tickets/${ticketId}/refund`, { method: 'POST', body: {} })
}
export function renewVisitorMembership(data) {
  needLive()
  return http('/visitor/membership/renew', {
    method: 'POST',
    body: data
  })
}
export function updateVisitorProfile(data) {
  needLive()

  return http('/visitor/profile', {
    method: 'PUT',
    body: data
  })
}

// My Family (dependents under 18). Live database only. The server uses the CustomerID of the session and
// checks every dependent id against that parent, so these never need a parent id.
// getFamily resolves to { limit, dependents: [{ customerId, firstName, dob, age, heightCm, consentedAt, tickets[] }] }.
export function getFamily() {
  needLive()
  return http('/family')
}

// data: { firstName, dob (YYYY-MM-DD), heightCm, consent: true }. The parent must have ticked the consent box.
export function addDependent(data) {
  needLive()
  return http('/family/dependents', { method: 'POST', body: data })
}

// data: { firstName, dob, heightCm }
export function updateDependent(id, data) {
  needLive()
  return http(`/family/dependents/${id}`, { method: 'PUT', body: data })
}

// The row is anonymised on the server (past tickets stay for reporting). Refused while a ticket is upcoming.
export function removeDependent(id) {
  needLive()
  return http(`/family/dependents/${id}`, { method: 'DELETE' })
}

// What the database will charge. Saves nothing. Resolves to { dayPass, expressAddOn, discountPct, discount, total, ... }.
export function quoteDependentTicket(id, visitDate, hasExpress) {
  needLive()
  const qs = new URLSearchParams({ visitDate, hasExpress: hasExpress ? '1' : '0' }).toString()
  return http(`/family/dependents/${id}/quote?${qs}`)
}

// Send { visitDate, hasExpress } only. The server sets the price. Resolves to the ticket plus { discount, firedTriggers }.
export function buyDependentTicket(id, data) {
  needLive()
  return http(`/family/dependents/${id}/tickets`, { method: 'POST', body: data })
}

export function refundDependentTicket(ticketId) {
  needLive()
  return http(`/family/tickets/${ticketId}/refund`, { method: 'POST', body: {} })
}

// Membership cancellation. A request, not an instant cancel: a manager approves or rejects it.
// Resolves to { membership, canRequest, blockedReason, requests[] } for the signed-in member.
export function getMyCancellations() {
  needLive()
  return http('/cancellations/mine')
}

// Send { reason } only (required, 200 characters or fewer). The server picks the membership that is active today.
export function requestCancellation(reason) {
  needLive()
  return http('/cancellations', { method: 'POST', body: { reason } })
}

// Cancellation review (Admin and RetailManager). The server sends every request, Pending first, then newest.
// Each row: { requestId, customerName, tier, startDate, endDate, autoRenew, requestedAt, reason, status, decidedAt, decidedBy, decisionNote }.
export function listCancellations() {
  needLive()
  return http('/cancellations')
}

// Approving turns auto-renew off and marks the request Approved. Nothing is refunded and the end date does not change.
// note is optional (200 characters or fewer). A request that was already decided comes back as a 409 error.
export function approveCancellation(requestId, note) {
  needLive()
  return http(`/cancellations/${requestId}/approve`, { method: 'POST', body: { note } })
}

export function rejectCancellation(requestId, note) {
  needLive()
  return http(`/cancellations/${requestId}/reject`, { method: 'POST', body: { note } })
}

// Public site data for the homepage and public pages: prices, hours, membership tiers, rides
// (Open/Closed only, never wait times) and venues. No sign-in needed. Works in mock mode too.
export function getPublicSite() {
  return USE_MOCK ? mock.getPublicSite() : http('/public/site')
}

// Generic data entry, used by components/RecordManager.jsx. `resource` is the API path, e.g. 'maintenance'.
export function listRecords(resource, query = {}) {
  needLive()
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null))
  const qs = params.toString()
  return http(`/${resource}${qs ? `?${qs}` : ''}`)
}

export function getRecord(resource, id) {
  needLive()
  return http(`/${resource}/${id}`)
}

export function getLookups(resource) {
  needLive()
  return http(`/${resource}/lookups`)
}

export function createRecord(resource, data) {
  needLive()
  return http(`/${resource}`, { method: 'POST', body: data })
}

export function updateRecord(resource, id, data) {
  needLive()
  return http(`/${resource}/${id}`, { method: 'PUT', body: data })
}

export function deleteRecord(resource, id, query = {}) {
  needLive()
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString()
  return http(`/${resource}/${id}${qs ? `?${qs}` : ''}`, { method: 'DELETE' })
}

// Employee portal (Maintenance Worker, Restaurant Worker): the server uses the EmployeeID of the session.
export function getMyWork() {
  needLive()
  return http('/me/work')
}

// Customer lookup for the ticket forms. name and dob (YYYY-MM-DD) are each optional, but one is needed.
export function searchCustomers(name, dob) {
  needLive()
  const qs = new URLSearchParams(Object.entries({ name, dob }).filter(([, v]) => v)).toString()
  return http(`/customers/search?${qs}`)
}

// Notifications. The list is public (homepage); mock mode just shows none.
export function listNotifications() {
  return USE_MOCK ? Promise.resolve([]) : http('/notifications')
}

export function createNotification(data) {
  needLive()
  return http('/notifications', { method: 'POST', body: data })
}

// "Delete" = dismiss (IsActive = 0 on the server).
export function dismissNotification(id) {
  needLive()
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
  needLive()
  return http('/admin/ping')
}

// Newest first. query: { limit }
export function adminAudit(query = {}) {
  needLive()
  return http(`/admin/audit${adminQuery(query)}`)
}

// Tables and views with approximate row counts.
export function adminListTables() {
  needLive()
  return http('/admin/tables')
}

// One page of a table. query: { page, size, sort, dir }. Response has columns, primaryKey and rows.
export function adminBrowseTable(name, query = {}) {
  needLive()
  return http(`/admin/tables/${encodeURIComponent(name)}${adminQuery(query)}`)
}

// SQL console. Read mode by default. Write mode needs write: true and confirm: 'WRITE'.
// Rows come back as arrays, with a `columns` list.
export function adminRunSql(sql, { write = false, confirm } = {}) {
  needLive()
  const body = { sql }
  if (write) {
    body.write = true
    body.confirm = confirm
  }
  return http('/admin/sql', { method: 'POST', body })
}

// Transactions per ID. type is 'customer', 'ticket' or 'membership'.
export function adminTransactions(type, id) {
  needLive()
  return http(`/admin/transactions/${encodeURIComponent(type)}/${encodeURIComponent(id)}`)
}

// Row Editor. Triggers and constraints still apply, and every change is audited.
export function adminInsertRow(table, values) {
  needLive()
  return http(`/admin/rows/${encodeURIComponent(table)}`, { method: 'POST', body: { values } })
}

// key must name exactly the primary key columns, e.g. { CustomerID: 1 }.
export function adminUpdateRow(table, key, values) {
  needLive()
  return http(`/admin/rows/${encodeURIComponent(table)}`, { method: 'PUT', body: { key, values } })
}

// Delete is a POST because the server only reads a body on POST, PUT and PATCH.
export function adminDeleteRow(table, key) {
  needLive()
  return http(`/admin/rows/${encodeURIComponent(table)}/delete`, { method: 'POST', body: { key } })
}

// SQL GUI. spec: { table, columns?, filters?, match?, sort?, dir?, limit? }.
// Response is the console shape plus `table`, `type` and `sql`.
export function adminBuild(spec) {
  needLive()
  return http('/admin/builder', { method: 'POST', body: spec })
}

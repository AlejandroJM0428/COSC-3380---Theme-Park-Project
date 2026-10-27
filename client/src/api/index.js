// Pages import from HERE, never from http.js or mock.js directly.
// Whatever the team decides about how the site reaches MySQL, only this file changes.
import { http } from './http.js'
import * as mock from './mock.js'
import * as visitorMock from './visitorMock.js'

// Mock mode is ON unless .env says VITE_USE_MOCK=false
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

export function login(username, password) {
  return USE_MOCK
    ? mock.login(username, password)
    : http('/auth/login', { method: 'POST', body: { username, password } })
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

export function listDemos() {
  needLive()
  return http('/demos')
}

export function runDemo(id, mode) {
  needLive()
  return http(`/demos/${id}/run`, { method: 'POST', body: { mode } })
}

export function createTicket(data) {
  needLive()
  return http('/tickets', { method: 'POST', body: data })
}

// Day 3+: add one function per form here, e.g.
// export function createTicket(data) { return http('/tickets', { method: 'POST', body: data }) }


// Visitor/customer portal baseline. Its preview mode is independent of staff mock/live mode,
// so the clearly labeled sample portal can be previewed in the Docker build too.
function needVisitorBackend() {
  if (import.meta.env.VITE_VISITOR_DEMO === 'false') {
    throw new Error('Live customer authentication and ticket endpoints are not wired yet. Set VITE_VISITOR_DEMO=true to use the labeled portal preview.')
  }
}

export function getVisitorDashboard() {
  needVisitorBackend()
  return visitorMock.getVisitorDashboard()
}

export function buyVisitorTicket(data) {
  needVisitorBackend()
  return visitorMock.buyVisitorTicket(data)
}

export function refundVisitorTicket(ticketId) {
  needVisitorBackend()
  return visitorMock.refundVisitorTicket(ticketId)
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

export function deleteRecord(resource, id) {
  needLive()
  return http(`/${resource}/${id}`, { method: 'DELETE' })
}

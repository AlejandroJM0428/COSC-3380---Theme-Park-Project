// Pages import from HERE, never from http.js or mock.js directly.
// Whatever the team decides about how the site reaches MySQL, only this file changes.
import { http } from './http.js'
import * as mock from './mock.js'

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

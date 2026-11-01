import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getReport, listRecords } from '../../api'
import './AdminHome.css'

// The admin Home screen. Layout: four number cards, a wide chart with a side panel, then a row of three cards.
// It only uses data the admin already has: staff accounts, rides, games and venues, and the Customers per Month report.
// goTo(groupId, itemKey) opens an area of the workspace.

const pad = (n) => String(n).padStart(2, '0')

function countBy(rows, key) {
  const counts = new Map()
  for (const r of rows) counts.set(r[key] ?? 'Unknown', (counts.get(r[key] ?? 'Unknown') ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function Kpi({ value, label, note, tone }) {
  return (
    <div className={`ah-kpi ah-${tone}`}>
      <div className="ah-kpi-main">
        <span className="ah-kpi-value">{value ?? '…'}</span>
        <span className="ah-kpi-label">{label}</span>
      </div>
      <div className="ah-kpi-note">{note}</div>
    </div>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <section className={`ah-card ${className}`}>
      <h2>{title}</h2>
      <div className="ah-card-body">{children}</div>
    </section>
  )
}

export default function AdminHome({ goTo }) {
  const [users, setUsers] = useState(null)
  const [places, setPlaces] = useState(null)
  const [months, setMonths] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // Starting inside .then() turns an immediate throw (mock mode) into a rejection the .catch below shows as a note.
    Promise.resolve()
      .then(() => Promise.all([listRecords('users'), listRecords('facilities'), getReport('customers-per-month')]))
      .then(([u, f, m]) => {
        if (!alive) return
        setUsers(u)
        setPlaces(f)
        setMonths(
          m
            .map((r) => ({ Month: `${r.VisitYear}-${pad(r.VisitMonth)}`, Customers: Number(r.Customers) }))
            .sort((a, b) => a.Month.localeCompare(b.Month)),
        )
      })
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [])

  const activeUsers = users?.filter((u) => Number(u.IsActive) === 1)
  const activePlaces = places?.filter((p) => Number(p.IsActive) === 1)
  const rides = activePlaces?.filter((p) => p.Kind === 'Ride')
  const inMaintenance = rides?.filter((r) => r.RideStatus === 'Maintenance')

  return (
    <div className="ah">
      {error && <p className="muted">Some numbers are unavailable: {error}</p>}

      <div className="ah-kpis">
        <Kpi tone="a" value={activeUsers?.length} label="Active staff accounts" note={users ? `${users.length - activeUsers.length} deactivated` : ''} />
        <Kpi tone="b" value={rides?.length} label="Active rides" note={inMaintenance ? `${inMaintenance.length} in maintenance` : ''} />
        <Kpi tone="c" value={activePlaces?.filter((p) => p.Kind === 'Game').length} label="Games" note="active" />
        <Kpi tone="d" value={activePlaces?.filter((p) => p.Kind === 'Venue').length} label="Venues" note="active" />
      </div>

      <div className="ah-main">
        <Card title="Customers per month" className="ah-chart">
          {months && months.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={months} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="Month" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="Customers" stroke="var(--lagoon)" fill="var(--lagoon)" fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">{months ? 'No visits recorded yet.' : 'Loading…'}</p>
          )}
        </Card>

        <Card title="Rides right now" className="ah-side">
          {rides ? (
            <ul className="ah-list">
              {countBy(rides, 'RideStatus').map(([status, n]) => (
                <li key={status}>
                  <strong>{n}</strong> <span>{status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </Card>
      </div>

      <div className="ah-row">
        <Card title="Rides in maintenance">
          {inMaintenance ? (
            inMaintenance.length === 0 ? (
              <p className="muted">None right now.</p>
            ) : (
              <ul className="ah-list">
                {inMaintenance.slice(0, 6).map((r) => (
                  <li key={r.FacilityKey}>{r.Name}</li>
                ))}
              </ul>
            )
          ) : (
            <p className="muted">Loading…</p>
          )}
          <button type="button" onClick={() => goTo('daily', 'maintenance')}>
            Open Maintenance
          </button>
        </Card>

        <Card title="Staff accounts by role">
          {activeUsers ? (
            <ul className="ah-list">
              {countBy(activeUsers, 'Role').map(([role, n]) => (
                <li key={role}>
                  <strong>{n}</strong> <span>{role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Loading…</p>
          )}
          <button type="button" onClick={() => goTo('people', 'users')}>
            Open Staff Accounts
          </button>
        </Card>

        <Card title="Jump to">
          <ul className="ah-list">
            <li><button type="button" onClick={() => goTo('reports')}>Reports</button></li>
            <li><button type="button" onClick={() => goTo('daily')}>Daily records</button></li>
            <li><button type="button" onClick={() => goTo('tools', 'triggers')}>Triggers</button></li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

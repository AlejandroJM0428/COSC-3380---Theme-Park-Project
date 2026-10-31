import { useEffect, useState } from 'react'
import { listRecords } from '../api'
import Dashboard from './Dashboard.jsx'
import { ADMIN_NAV_SECTIONS } from '../config/nav.js'
import './AdminDashboard.css'

// Admin home: a short "state of the park" summary, then the admin menu cards.
// The numbers come from the same two lists the Staff Accounts and Rides pages already use.
function Stat({ label, value, note }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-value">{value ?? '…'}</span>
      <span className="admin-stat-label">{label}</span>
      {note && <span className="admin-stat-note">{note}</span>}
    </div>
  )
}

function AdminSummary() {
  const [users, setUsers] = useState(null)
  const [places, setPlaces] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // Starting inside .then() turns an immediate throw (mock mode) into a rejection the .catch below shows as a note.
    Promise.resolve()
      .then(() => Promise.all([listRecords('users'), listRecords('facilities')]))
      .then(([u, f]) => {
        if (!alive) return
        setUsers(u)
        setPlaces(f)
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
    <section className="admin-summary" aria-label="Park summary">
      {error && <p className="muted">Summary unavailable: {error}</p>}
      <Stat label="Active staff accounts" value={activeUsers?.length} note={users ? `${users.length - activeUsers.length} deactivated` : null} />
      <Stat label="Active rides" value={rides?.length} note={inMaintenance ? `${inMaintenance.length} in maintenance` : null} />
      <Stat label="Games" value={activePlaces?.filter((p) => p.Kind === 'Game').length} />
      <Stat label="Venues" value={activePlaces?.filter((p) => p.Kind === 'Venue').length} />
    </section>
  )
}

export default function AdminDashboard() {
  return (
    <Dashboard base="/admin" sections={ADMIN_NAV_SECTIONS}>
      <AdminSummary />
    </Dashboard>
  )
}

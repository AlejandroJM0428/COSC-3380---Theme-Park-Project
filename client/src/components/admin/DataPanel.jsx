import { useEffect, useState } from 'react'
import { adminRunSql } from '../../api'
import { listTriggers } from '../../api/triggers.js'
import { FORM_PAGES } from '../../config/nav.js'
import ErrorBanner from '../ErrorBanner.jsx'
import './DataPanel.css'

// Admin tool: data importance. The data that matters most, why, how much of it there is right now,
// which triggers guard it, and which roles can change it.
// Counts come from one read-only query. Triggers come from the live database (GET /api/triggers).
// Roles come from the page list in config/nav.js, so this panel follows any role change on its own.
// To change what the panel says, edit GROUPS below.

// `pages` = the data-entry pages (path in config/nav.js) that change this table. No page = admin only, in the Row Editor.
const GROUPS = [
  {
    title: 'Rides and maintenance',
    why: 'Safety and downtime. This is how the park tells whether low ridership comes from broken rides or low demand.',
    tables: [
      { name: 'Ride', holds: 'Every ride, its height limit, Express and status', pages: ['facilities'] },
      { name: 'Maintenance', holds: 'Repair jobs, type, outcome and repair cost', pages: ['maintenance'] },
      { name: 'MaintenanceCrew', holds: 'Which technicians worked each job', pages: [] },
    ],
  },
  {
    title: 'Sales and attendance',
    why: 'The money and the crowd. Every ticket, boarding, play and purchase is a record that is never edited afterwards.',
    tables: [
      { name: 'Ticket', holds: 'Day passes with date, price and Express', pages: ['tickets', 'refunds'] },
      { name: 'TicketRefund', holds: 'Refunds and the weather behind them', pages: ['refunds'] },
      { name: 'Purchase', holds: 'Food and shop sales with the price paid', pages: ['purchases'] },
      { name: 'GamePlay', holds: 'Game plays with the amount paid', pages: ['game-plays'] },
      { name: 'RideLog', holds: 'Every boarding and wait reading', pages: ['ride-log'] },
    ],
  },
  {
    title: 'Members and guests',
    why: 'Revenue per tier, expiring memberships and retention all come from these tables.',
    tables: [
      { name: 'Customer', holds: 'Guests, their height and whether they are active', pages: ['customers'] },
      { name: 'Membership', holds: 'Memberships with dates and the tier price', pages: ['memberships'] },
      { name: 'MembershipTier', holds: 'Tiers, prices and whether a tier is still sold', pages: [] },
    ],
  },
  {
    title: 'Staff and access',
    why: 'Who works, who is certified on a ride, and who can log in as which role.',
    tables: [
      { name: 'Employee', holds: 'Staff, job title, hire date and pay', pages: [] },
      { name: 'Shift', holds: 'Clock-in and clock-out with the shift rating', pages: ['employees'] },
      { name: 'RideCertification', holds: 'Which operators are certified on which ride', pages: [] },
      { name: 'AppUser', holds: 'Logins and their roles', pages: ['users'] },
    ],
  },
  {
    title: 'Trail and notices',
    why: 'Proof of what changed, and the notices guests see.',
    tables: [
      { name: 'AdminAudit', holds: 'Every change an admin made through the admin tools', pages: [] },
      { name: 'Notification', holds: 'Sold-out, weather and maintenance notices', pages: ['notifications'] },
    ],
  },
]

const COUNT_SQL = GROUPS.flatMap((g) => g.tables)
  .map((t) => `SELECT '${t.name}' AS tbl, COUNT(*) AS n FROM ${t.name}`)
  .join(' UNION ALL ')

// Roles that can change a table through a page, plus Admin, who can change anything in the Row Editor.
function whoCanChange(pages) {
  const roles = new Set(['Admin'])
  for (const path of pages) {
    const page = FORM_PAGES.find((f) => f.path === path)
    for (const role of page?.roles ?? []) roles.add(role)
  }
  return [...roles]
}

export default function DataPanel() {
  const [counts, setCounts] = useState(null)
  const [triggers, setTriggers] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // Starting inside .then() turns an immediate throw (mock mode) into a rejection the .catch shows as a note.
    Promise.resolve()
      .then(() => adminRunSql(COUNT_SQL))
      .then((out) => alive && setCounts(new Map(out.rows.map((r) => [String(r[0]), Number(r[1])]))))
      .catch((e) => alive && setError(e.message))
    Promise.resolve()
      .then(() => listTriggers())
      .then((out) => alive && setTriggers(out.triggers ?? []))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const byTable = new Map()
  for (const t of triggers ?? []) {
    if (t.inDatabase === false) continue
    byTable.set(t.table, [...(byTable.get(t.table) ?? []), t.name])
  }

  return (
    <div className="dp">
      <h2>Data importance</h2>
      <p className="muted">
        The data the park cannot run without. Counts are live. The triggers listed run inside the database, so they guard
        the table whichever page or tool changes it.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />

      {GROUPS.map((g) => (
        <section key={g.title} className="dp-group">
          <h3>{g.title}</h3>
          <p className="dp-why">{g.why}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>What it holds</th>
                  <th className="dp-num">Rows</th>
                  <th>Guarded by</th>
                  <th>Who can change it</th>
                </tr>
              </thead>
              <tbody>
                {g.tables.map((t) => {
                  const names = byTable.get(t.name) ?? []
                  const roles = whoCanChange(t.pages)
                  return (
                    <tr key={t.name}>
                      <th scope="row">{t.name}</th>
                      <td>{t.holds}</td>
                      <td className="dp-num">{counts ? (counts.get(t.name) ?? '—') : '…'}</td>
                      <td>{triggers ? (names.length ? names.join(', ') : 'No trigger') : '…'}</td>
                      <td>{roles.length === 1 ? 'Admin only (Row Editor)' : roles.join(', ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

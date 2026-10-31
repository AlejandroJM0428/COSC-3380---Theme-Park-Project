import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listRecords } from '../api'
import { useAuth } from '../auth/context.js'
import { ADMIN_NAV_SECTIONS, PARK_SHORT, ROLE_INFO } from '../config/nav.js'
import BrowsePanel from '../components/admin/BrowsePanel.jsx'
import BuilderPanel from '../components/admin/BuilderPanel.jsx'
import RowEditorPanel from '../components/admin/RowEditorPanel.jsx'
import SqlConsolePanel from '../components/admin/SqlConsolePanel.jsx'
import TransactionsPanel from '../components/admin/TransactionsPanel.jsx'
import MaintenancePage from './MaintenancePage.jsx'
import NotificationsPage from './NotificationsPage.jsx'
import Placeholder from './Placeholder.jsx'
import ReportPage from './ReportPage.jsx'
import SellTicket from './SellTicket.jsx'
import ShiftRatingsPage from './ShiftRatingsPage.jsx'
import TicketSalesPage from './TicketSalesPage.jsx'
import { CustomersPage, FacilitiesPage, GamePlaysPage, MembershipsPage, PurchasesPage, RideLogPage, UsersPage, WeatherPage } from './DataEntryPages.jsx'
import './AdminDashboard.css'
import './AdminOnePage.css'

// The one-page admin (no sidebar). Headline numbers, a row of jump links, then stacked sections:
// People and access, Park setup, Reports, Daily records, Database tools.
// The People, Park setup, Reports and Daily records lists are read from ADMIN_NAV_SECTIONS (config/nav.js),
// so every item of the old admin menu has a place here and a new menu item shows up on its own.
// Each section opens on demand and only loads its data when opened. The existing pages are used as they are.

// Same map as PAGE_COMPONENTS in App.jsx (key = the `path` in config/nav.js).
const PAGES = {
  tickets: SellTicket,
  refunds: TicketSalesPage,
  maintenance: MaintenancePage,
  employees: ShiftRatingsPage,
  notifications: NotificationsPage,
  customers: CustomersPage,
  memberships: MembershipsPage,
  purchases: PurchasesPage,
  'game-plays': GamePlaysPage,
  'ride-log': RideLogPage,
  weather: WeatherPage,
  facilities: FacilitiesPage,
  users: UsersPage,
}

const REPORT_PREFIX = '/reports/'
const TOOLS = [
  { key: 'browse', label: 'Browse Table' },
  { key: 'console', label: 'SQL Console' },
  { key: 'builder', label: 'SQL GUI' },
  { key: 'transactions', label: 'Transactions per ID' },
  { key: 'rows', label: 'Row Editor' },
]

// Menu entries this admin may open, as { key, label, note, group }.
function entries(section, role) {
  return (section?.items ?? [])
    .filter((i) => i.roles.includes(role))
    .map((i) => ({ key: i.to.startsWith(REPORT_PREFIX) ? i.to.slice(REPORT_PREFIX.length) : i.to.slice(1), label: i.label, note: i.note, group: section.title }))
}

function Stat({ label, value, note }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-value">{value ?? '…'}</span>
      <span className="admin-stat-label">{label}</span>
      {note && <span className="admin-stat-note">{note}</span>}
    </div>
  )
}

// Same four numbers as the old admin home.
function Headline() {
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

// One entry shown in place. `kind` is 'report' or 'page'.
function EntryView({ entry, kind }) {
  if (kind === 'report') return <ReportPage key={entry.key} reportKey={entry.key} />
  const Page = PAGES[entry.key]
  return Page ? <Page key={entry.key} /> : <Placeholder title={entry.label} />
}

// The body of a section that lists entries: a drop-down (hidden when there is only one), then the chosen entry.
function EntryPicker({ id, entries: list, kind, startWith, prompt }) {
  const [chosen, setChosen] = useState(startWith ? list[0]?.key ?? '' : '')
  const current = list.find((e) => e.key === chosen)
  const groups = [...new Set(list.map((e) => e.group))]
  const label = kind === 'report' ? 'Report' : 'Show'

  if (list.length === 0) return <p className="muted">Nothing here for your role.</p>
  return (
    <div>
      {list.length > 1 && (
        <div className="toolbar">
          <label>
            {label}
            <select id={`${id}-pick`} value={chosen} onChange={(e) => setChosen(e.target.value)}>
              {!startWith && <option value="">{prompt}</option>}
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {list
                    .filter((e) => e.group === g)
                    .map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      )}
      {current?.note && <p className="muted">{current.note}</p>}
      {current && (
        <div className="onepage-entry">
          <EntryView entry={current} kind={kind} />
        </div>
      )}
    </div>
  )
}

// A tab strip of database tools. A tool stays mounted once opened, so switching tabs does not lose what was typed.
function DatabaseTools() {
  const [tool, setTool] = useState('browse')
  const [seen, setSeen] = useState(() => new Set(['browse']))
  const [sql, setSql] = useState('SELECT COUNT(*) AS customers FROM Customer')

  function open(key) {
    setTool(key)
    setSeen((s) => (s.has(key) ? s : new Set(s).add(key)))
  }

  function useInConsole(text) {
    setSql(text)
    open('console')
  }

  const body = {
    browse: <BrowsePanel />,
    console: <SqlConsolePanel sql={sql} onSqlChange={setSql} />,
    builder: <BuilderPanel onUseInConsole={useInConsole} />,
    transactions: <TransactionsPanel />,
    rows: <RowEditorPanel />,
  }

  return (
    <div>
      <p className="muted">
        Raw access to the database for admins only. Everything here is checked on the server, and every change is written to the audit log.
        Also open: <Link to="/admin/queries">required queries</Link> and <Link to="/admin/trigger-demos">trigger demos</Link>.
      </p>
      <div className="onepage-tabs" role="tablist" aria-label="Database tools">
        {TOOLS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tool-tab-${t.key}`} aria-selected={tool === t.key} aria-controls={`tool-${t.key}`} onClick={() => open(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {TOOLS.filter((t) => seen.has(t.key)).map((t) => (
        <div key={t.key} id={`tool-${t.key}`} role="tabpanel" aria-labelledby={`tool-tab-${t.key}`} hidden={tool !== t.key}>
          {body[t.key]}
        </div>
      ))}
    </div>
  )
}

export default function AdminOnePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const role = user.role
  const info = ROLE_INFO[role] ?? { title: role }
  const byTitle = (title) => ADMIN_NAV_SECTIONS.find((s) => s.title === title)

  const reportEntries = ADMIN_NAV_SECTIONS.filter((s) => s.items.some((i) => i.to.startsWith(REPORT_PREFIX))).flatMap((s) => entries(s, role))

  const sections = [
    { id: 'people', title: 'People & access', zone: 'var(--plum)', body: <EntryPicker id="people" entries={entries(byTitle('People & access'), role)} kind="page" startWith /> },
    { id: 'park', title: 'Park setup', zone: 'var(--lagoon)', body: <EntryPicker id="park" entries={entries(byTitle('Park setup'), role)} kind="page" startWith /> },
    { id: 'reports', title: 'Reports', zone: 'var(--sun)', body: <EntryPicker id="reports" entries={reportEntries} kind="report" prompt="Choose a report…" /> },
    { id: 'daily', title: 'Daily records', zone: 'var(--coral)', body: <EntryPicker id="daily" entries={entries(byTitle('Daily records'), role)} kind="page" prompt="Choose a record type…" /> },
    { id: 'tools', title: 'Database tools', zone: 'var(--ink)', body: <DatabaseTools /> },
  ]

  const [open, setOpen] = useState(() => new Set(['people']))

  function toggle(id) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // A jump link opens its section, then scrolls to it once it is on the page.
  function jump(id) {
    setOpen((s) => (s.has(id) ? s : new Set(s).add(id)))
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="onepage" data-role={role}>
      <header className="onepage-top">
        <div className="onepage-brand">
          <span className="brand-name">{PARK_SHORT}</span>
          <span className="brand-sub">Admin portal</span>
        </div>
        <div className="onepage-user">
          <span>
            {user.username} ({info.title})
          </span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <div className="awning-wrap">
        <div className="awning" />
      </div>

      <main className="onepage-main">
        <h1>Control room</h1>
        <Headline />

        <nav className="onepage-jump" aria-label="Jump to a section">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); jump(s.id) }}>
              {s.title}
            </a>
          ))}
        </nav>

        {sections.map((s) => {
          const isOpen = open.has(s.id)
          return (
            <section key={s.id} id={s.id} className="onepage-section" style={{ '--zone': s.zone }} aria-labelledby={`${s.id}-title`}>
              <div className="onepage-section-head">
                <h2 id={`${s.id}-title`}>{s.title}</h2>
                <button type="button" aria-expanded={isOpen} aria-controls={`${s.id}-body`} onClick={() => toggle(s.id)}>
                  {isOpen ? 'Hide' : 'Show'}
                </button>
              </div>
              {isOpen && (
                <div id={`${s.id}-body`} className="onepage-section-body">
                  {s.body}
                </div>
              )}
            </section>
          )
        })}
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import QueryPage from './QueryPage.jsx'
import ReportPage from './ReportPage.jsx'
import SellTicket from './SellTicket.jsx'
import ShiftRatingsPage from './ShiftRatingsPage.jsx'
import TicketSalesPage from './TicketSalesPage.jsx'
import TriggerList from './TriggerList.jsx'
import { CustomersPage, FacilitiesPage, GamePlaysPage, MembershipsPage, PurchasesPage, RideLogPage, UsersPage, WeatherPage } from './DataEntryPages.jsx'
import './AdminOnePage.css'

// The one-page admin (no sidebar): one workspace instead of stacked sections.
// A tab bar picks the group (People & access, Park setup, Reports, Daily records, Database tools).
// A list on the left picks the item, and the item opens in place on the right. Only the right side scrolls.
// The choice lives in the address as #group/item (for example #reports/revenue), so a refresh or a shared link returns to it.
// The People, Park setup, Reports and Daily records lists are read from ADMIN_NAV_SECTIONS (config/nav.js),
// so every item of the old admin menu has a place here and a new menu item shows up on its own.
// The existing pages and panels are used as they are. Required Queries and Triggers open here too;
// their addresses (/admin/queries and /admin/triggers) also work.

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
  { key: 'queries', label: 'Required Queries' },
  { key: 'triggers', label: 'Triggers' },
]

// Menu entries this admin may open, as { key, label, note, group }.
function entries(section, role) {
  return (section?.items ?? [])
    .filter((i) => i.roles.includes(role))
    .map((i) => ({ key: i.to.startsWith(REPORT_PREFIX) ? i.to.slice(REPORT_PREFIX.length) : i.to.slice(1), label: i.label, note: i.note, group: section.title }))
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

// '#reports/revenue' -> { group: 'reports', item: 'revenue' }. Either part can be missing.
function parseHash(hash) {
  const raw = hash.replace(/^#/, '')
  const slash = raw.indexOf('/')
  if (slash < 0) return { group: safeDecode(raw), item: '' }
  return { group: safeDecode(raw.slice(0, slash)), item: safeDecode(raw.slice(slash + 1)) }
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

// The database tools. A tool stays mounted once opened, so switching tools does not lose what was typed.
function ToolsBody({ tool, sql, onSqlChange, onUseInConsole }) {
  const [seen, setSeen] = useState(() => new Set())
  // Adjusting state while rendering (not in an effect): remember every tool that has been shown.
  if (!seen.has(tool)) setSeen(new Set(seen).add(tool))

  const body = {
    browse: <BrowsePanel />,
    console: <SqlConsolePanel sql={sql} onSqlChange={onSqlChange} />,
    builder: <BuilderPanel onUseInConsole={onUseInConsole} />,
    transactions: <TransactionsPanel />,
    rows: <RowEditorPanel />,
    queries: <QueryPage />,
    triggers: <TriggerList />,
  }

  return (
    <div>
      <p className="muted">
        Raw access to the database for admins only. Everything here is checked on the server, and every change is written to the audit log.
      </p>
      {TOOLS.filter((t) => t.key === tool || seen.has(t.key)).map((t) => (
        <div key={t.key} id={`tool-${t.key}`} hidden={tool !== t.key}>
          {body[t.key]}
        </div>
      ))}
    </div>
  )
}

// Left list (wide screens) or a drop-down (narrow screens) that picks the item inside a group.
function ItemList({ group, items, current, onPick }) {
  const subheads = [...new Set(items.map((i) => i.group))]
  const showHeads = subheads.length > 1
  return (
    <>
      <nav className="onepage-rail" aria-label={`${group.title} items`}>
        {subheads.map((g) => (
          <div key={g} className="onepage-rail-group">
            {showHeads && <span className="onepage-rail-head">{g}</span>}
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <button key={i.key} type="button" aria-current={i.key === current ? 'page' : undefined} onClick={() => onPick(i.key)}>
                  {i.label}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <label className="onepage-picker">
        {group.title}
        <select value={current} onChange={(e) => onPick(e.target.value)}>
          {subheads.map((g) => (
            <optgroup key={g} label={g}>
              {items
                .filter((i) => i.group === g)
                .map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  )
}

export default function AdminOnePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const role = user.role
  const info = ROLE_INFO[role] ?? { title: role }
  const byTitle = (title) => ADMIN_NAV_SECTIONS.find((s) => s.title === title)

  const reportEntries = ADMIN_NAV_SECTIONS.filter((s) => s.items.some((i) => i.to.startsWith(REPORT_PREFIX))).flatMap((s) => entries(s, role))

  const groups = [
    { id: 'people', title: 'People & access', zone: 'var(--plum)', kind: 'page', items: entries(byTitle('People & access'), role) },
    { id: 'park', title: 'Park setup', zone: 'var(--lagoon)', kind: 'page', items: entries(byTitle('Park setup'), role) },
    { id: 'reports', title: 'Reports', zone: 'var(--sun)', kind: 'report', items: reportEntries },
    { id: 'daily', title: 'Daily records', zone: 'var(--coral)', kind: 'page', items: entries(byTitle('Daily records'), role) },
    { id: 'tools', title: 'Database tools', zone: 'var(--ink)', kind: 'tool', items: TOOLS.map((t) => ({ ...t, group: 'Database tools' })) },
  ].filter((g) => g.items.length > 0)

  // What is on screen comes from the address. A missing or unknown part falls back to the first group or item.
  const parsed = parseHash(location.hash)
  const group = groups.find((g) => g.id === parsed.group) ?? groups[0]
  const [lastPick, setLastPick] = useState({})
  const item = group?.items.find((i) => i.key === parsed.item) ?? group?.items.find((i) => i.key === lastPick[group.id]) ?? group?.items[0]

  // Groups that have been shown stay mounted (hidden), so Row Editor text or a half-filled form survives a tab change.
  const [visited, setVisited] = useState(() => new Set())
  if (group && !visited.has(group.id)) setVisited(new Set(visited).add(group.id))

  const [sql, setSql] = useState('SELECT COUNT(*) AS customers FROM Customer')

  function go(groupId, itemKey) {
    const target = groups.find((g) => g.id === groupId)
    const key = itemKey ?? lastPick[groupId] ?? target.items[0].key
    setLastPick((p) => ({ ...p, [groupId]: key }))
    navigate({ pathname: location.pathname, search: location.search, hash: `#${groupId}/${encodeURIComponent(key)}` }, { replace: true })
  }

  function useInConsole(text) {
    setSql(text)
    go('tools', 'console')
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
        <div className="onepage-strip">
          <h1>Control room</h1>
          <Headline />
        </div>

        <div className="onepage-groups" role="tablist" aria-label="Admin areas">
          {groups.map((g) => (
            <button key={g.id} type="button" role="tab" id={`group-tab-${g.id}`} aria-selected={g.id === group?.id} aria-controls={`group-${g.id}`} onClick={() => go(g.id)}>
              {g.title}
            </button>
          ))}
        </div>

        {groups
          .filter((g) => visited.has(g.id))
          .map((g) => {
            const shown = g.id === group?.id
            const current = shown ? item : g.items.find((i) => i.key === lastPick[g.id]) ?? g.items[0]
            const single = g.items.length === 1
            return (
              <div key={g.id} id={`group-${g.id}`} role="tabpanel" aria-labelledby={`group-tab-${g.id}`} className={`onepage-work${single ? ' single' : ''}`} style={{ '--zone': g.zone }} hidden={!shown}>
                {!single && <ItemList group={g} items={g.items} current={current.key} onPick={(key) => go(g.id, key)} />}
                <section className="onepage-pane" aria-label={g.title}>
                  {g.kind === 'tool' ? (
                    <ToolsBody tool={current.key} sql={sql} onSqlChange={setSql} onUseInConsole={useInConsole} />
                  ) : (
                    <>
                      {current.note && <p className="muted">{current.note}</p>}
                      <EntryView entry={current} kind={g.kind} />
                    </>
                  )}
                </section>
              </div>
            )
          })}
      </main>
    </div>
  )
}

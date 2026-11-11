import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { ADMIN_NAV_SECTIONS, PARK_SHORT, ROLE_INFO } from '../config/nav.js'
import AdminHome from '../components/admin/AdminHome.jsx'
import CancellationsPage from './CancellationsPage.jsx'
import MaintenancePage from './MaintenancePage.jsx'
import NotificationsPage from './NotificationsPage.jsx'
import Placeholder from './Placeholder.jsx'
import ReportPage from './ReportPage.jsx'
import SellTicket from './SellTicket.jsx'
import ShiftRatingsPage from './ShiftRatingsPage.jsx'
import TicketSalesPage from './TicketSalesPage.jsx'
import { CustomersPage, FacilitiesPage, GamePlaysPage, MembershipsPage, PurchasesPage, RideLogPage, UsersPage, WeatherPage } from './DataEntryPages.jsx'
import './AdminOnePage.css'

// The one-page admin (no sidebar): one workspace instead of stacked sections.
// A white header shows the park and who is signed in. Under it a tab bar picks the area:
// Home, People & access, Park setup, Reports, Daily records. Each area (except Home) opens a drop-down of its items,
// and the chosen item opens in place below. Home is the overview: number cards, a chart and a few lists.
// The choice lives in the address as #group/item (for example #reports/revenue), so a refresh or a shared link returns to it.
// The People, Park setup, Reports and Daily records lists are read from ADMIN_NAV_SECTIONS (config/nav.js),
// so every item of the old admin menu has a place here and a new menu item shows up on its own.
// There is no Database tools area any more.

// Same map as PAGE_COMPONENTS in App.jsx (key = the `path` in config/nav.js).
const PAGES = {
  tickets: SellTicket,
  refunds: TicketSalesPage,
  maintenance: MaintenancePage,
  employees: ShiftRatingsPage,
  notifications: NotificationsPage,
  customers: CustomersPage,
  memberships: MembershipsPage,
  cancellations: CancellationsPage,
  purchases: PurchasesPage,
  'game-plays': GamePlaysPage,
  'ride-log': RideLogPage,
  weather: WeatherPage,
  facilities: FacilitiesPage,
  users: UsersPage,
}

const REPORT_PREFIX = '/reports/'
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

// One entry shown in place. `kind` is 'report' or 'page'.
function EntryView({ entry, kind }) {
  if (kind === 'report') return <ReportPage key={entry.key} reportKey={entry.key} />
  const Page = PAGES[entry.key]
  return Page ? <Page key={entry.key} /> : <Placeholder title={entry.label} />
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
    { id: 'home', title: 'Home', zone: 'var(--lagoon)', kind: 'home', items: [{ key: 'overview', label: 'Overview', group: 'Home' }] },
    { id: 'people', title: 'People & access', zone: 'var(--plum)', kind: 'page', items: entries(byTitle('People & access'), role) },
    { id: 'park', title: 'Park setup', zone: 'var(--lagoon)', kind: 'page', items: entries(byTitle('Park setup'), role) },
    { id: 'reports', title: 'Reports', zone: 'var(--sun)', kind: 'report', items: reportEntries },
    { id: 'daily', title: 'Daily records', zone: 'var(--coral)', kind: 'page', items: entries(byTitle('Daily records'), role) },
  ].filter((g) => g.items.length > 0)

  // What is on screen comes from the address. A missing or unknown part falls back to the first group or item.
  const parsed = parseHash(location.hash)
  const group = groups.find((g) => g.id === parsed.group) ?? groups[0]
  const [lastPick, setLastPick] = useState({})
  const item = group?.items.find((i) => i.key === parsed.item) ?? group?.items.find((i) => i.key === lastPick[group.id]) ?? group?.items[0]

  // Groups that have been shown stay mounted (hidden), so Row Editor text or a half-filled form survives a tab change.
  const [visited, setVisited] = useState(() => new Set())
  if (group && !visited.has(group.id)) setVisited(new Set(visited).add(group.id))

  // The tab whose drop-down is open (an id from `groups`, or null). Esc or a click elsewhere closes it.
  const [menu, setMenu] = useState(null)
  const navRef = useRef(null)
  useEffect(() => {
    if (!menu) return undefined
    const onDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setMenu(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  function go(groupId, itemKey) {
    const target = groups.find((g) => g.id === groupId)
    const key = itemKey ?? lastPick[groupId] ?? target.items[0].key
    setLastPick((p) => ({ ...p, [groupId]: key }))
    setMenu(null)
    navigate({ pathname: location.pathname, search: location.search, hash: `#${groupId}/${encodeURIComponent(key)}` }, { replace: true })
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="onepage" data-role={role}>
      <header className="onepage-top">
        <div className="onepage-brand">
          <span className="onepage-logo" aria-hidden="true">
            {PARK_SHORT.charAt(0)}
          </span>
          <span className="onepage-brand-text">
            <span className="brand-name">{PARK_SHORT}</span>
            <span className="brand-sub">Admin portal</span>
          </span>
        </div>
        <div className="onepage-user">
          <span>
            {user.name || 'Admin'} ({info.title})
          </span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="onepage-nav" aria-label="Admin areas" ref={navRef}>
        {groups.map((g) => {
          const dropdown = g.items.length > 1
          const open = menu === g.id
          return (
            <div key={g.id} className="onepage-tabwrap">
              <button
                type="button"
                className="onepage-tab"
                id={`group-tab-${g.id}`}
                aria-current={g.id === group?.id ? 'page' : undefined}
                aria-haspopup={dropdown ? 'true' : undefined}
                aria-expanded={dropdown ? open : undefined}
                onClick={() => (dropdown ? setMenu(open ? null : g.id) : go(g.id))}
              >
                {g.title}
                {dropdown && <span className="onepage-caret" aria-hidden="true" />}
              </button>
              {dropdown && open && (
                <ul className="onepage-menu">
                  {g.items.map((i) => (
                    <li key={i.key}>
                      <button type="button" aria-current={g.id === group?.id && i.key === item?.key ? 'page' : undefined} onClick={() => go(g.id, i.key)}>
                        {i.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <main className="onepage-main">
        {groups
          .filter((g) => visited.has(g.id))
          .map((g) => {
            const shown = g.id === group?.id
            const current = shown ? item : g.items.find((i) => i.key === lastPick[g.id]) ?? g.items[0]
            return (
              <div key={g.id} id={`group-${g.id}`} role="tabpanel" aria-labelledby={`group-tab-${g.id}`} className={`onepage-work${g.kind === 'home' ? ' home' : ''}`} style={{ '--zone': g.zone }} hidden={!shown}>
                <section className="onepage-pane" aria-label={g.title}>
                  {g.kind === 'home' ? (
                    <AdminHome goTo={go} />
                  ) : (
                    <>
                      <h1 className="onepage-title">
                        {g.title} <span aria-hidden="true">›</span> {current.label}
                      </h1>
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

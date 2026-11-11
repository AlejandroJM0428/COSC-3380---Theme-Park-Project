import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { NAV_SECTIONS, PARK_SHORT, ROLE_INFO } from '../config/nav.js'
import NoticePopup from './NoticePopup.jsx'
import '../pages/AdminOnePage.css'

// The shell for the staff portal (and the older admin pages): the same look as the one-page admin.
// A white header shows the park and who is signed in. Under it a tab bar: Dashboard, then one tab per menu section.
// A section with several items opens a drop-down; a section with one item is a plain link.
// The page opens in the framed pane below. Each page keeps its own address, so refresh and back still work.
// The staff portal uses the defaults. The admin pages pass base="/admin" and their own sections.
// data-role on the shell sets the role color (logo, active tab, primary buttons).
export default function Layout({ base = '/staff', sections = NAV_SECTIONS, brandSub = 'Transaction portal' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const info = ROLE_INFO[user.role] ?? { title: user.role }

  // Sections this role may open, with the items it may see.
  const tabs = sections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.roles.includes(user.role)) }))
    .filter((section) => section.items.length > 0)

  const pathOf = (item) => `${base}${item.to}`
  const onDashboard = location.pathname === base || location.pathname === `${base}/`
  const current = tabs.find((s) => s.items.some((i) => location.pathname === pathOf(i)))
  const currentItem = current?.items.find((i) => location.pathname === pathOf(i))

  // The tab whose drop-down is open (a section title, or null). Esc, a click elsewhere or a page change closes it.
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

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="onepage" data-role={user.role}>
      <NoticePopup />
      <header className="onepage-top">
        <div className="onepage-brand">
          <span className="onepage-logo" aria-hidden="true">
            {PARK_SHORT.charAt(0)}
          </span>
          <span className="onepage-brand-text">
            <span className="brand-name">{PARK_SHORT}</span>
            <span className="brand-sub">{brandSub}</span>
          </span>
        </div>
        <div className="onepage-user">
          <span>
            {user.name || 'Staff member'} ({info.title})
          </span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="onepage-nav" aria-label="Portal areas" ref={navRef}>
        <div className="onepage-tabwrap">
          <NavLink to={base} end className="onepage-tab" aria-current={onDashboard ? 'page' : undefined} onClick={() => setMenu(null)}>
            Dashboard
          </NavLink>
        </div>
        {tabs.map((section) => {
          const dropdown = section.items.length > 1
          const open = menu === section.title
          const active = current?.title === section.title
          if (!dropdown) {
            const only = section.items[0]
            return (
              <div key={section.title} className="onepage-tabwrap">
                <NavLink to={pathOf(only)} className="onepage-tab" aria-current={active ? 'page' : undefined} onClick={() => setMenu(null)}>
                  {only.label}
                </NavLink>
              </div>
            )
          }
          return (
            <div key={section.title} className="onepage-tabwrap">
              <button
                type="button"
                className="onepage-tab"
                aria-current={active ? 'page' : undefined}
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setMenu(open ? null : section.title)}
              >
                {section.title}
                <span className="onepage-caret" aria-hidden="true" />
              </button>
              {open && (
                <ul className="onepage-menu">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink to={pathOf(item)} aria-current={location.pathname === pathOf(item) ? 'page' : undefined} onClick={() => setMenu(null)}>
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <main className="onepage-main">
        <div className="onepage-work" style={{ '--zone': current?.zone ?? 'var(--lagoon)' }}>
          <section className="onepage-pane" aria-label={currentItem?.label ?? 'Dashboard'}>
            <Outlet />
          </section>
        </div>
      </main>
    </div>
  )
}

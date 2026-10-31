import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { NAV_SECTIONS, PARK_SHORT, ROLE_INFO } from '../config/nav.js'

// The shell: sidebar menu (filtered by role) + the page content on the right.
// The staff portal uses the defaults. The admin portal passes base="/admin" and its own sections.
// data-role on the shell sets the role color (awning, active item, primary buttons).
export default function Layout({ base = '/staff', sections = NAV_SECTIONS, brandSub = 'Transaction portal' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const info = ROLE_INFO[user.role] ?? { title: user.role }

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell" data-role={user.role}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-name">{PARK_SHORT}</span>
          <span className="brand-sub">{brandSub}</span>
        </div>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close menu' : 'Menu'}
        </button>
        <div className={menuOpen ? 'menu open' : 'menu'}>
          <nav onClick={() => setMenuOpen(false)}>
            <NavLink to={base} end>
              Dashboard
            </NavLink>
            {sections.map((section) => {
              const items = section.items.filter((item) => item.roles.includes(user.role))
              if (items.length === 0) return null
              return (
                <div key={section.title} className="nav-section" style={{ '--zone': section.zone }}>
                  <h2>{section.title}</h2>
                  {items.map((item) => (
                    <NavLink key={item.to} to={`${base}${item.to}`}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )
            })}
          </nav>
          <div className="stub">
            <div className="stub-main">
              <span className="stub-role">{info.title}</span>
              <span className="stub-user">
                {user.username} ({user.role})
              </span>
            </div>
            <div className="stub-tear">
              <button type="button" className="stub-out" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        </div>
      </aside>
      <div className="stage">
        <div className="awning-wrap">
          <div className="awning" />
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

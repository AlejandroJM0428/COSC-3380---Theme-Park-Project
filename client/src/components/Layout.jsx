import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { NAV_SECTIONS } from '../config/nav.js'

// The shell: sidebar menu (filtered by role) + the page content on the right.
export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Theme Park</div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => item.roles.includes(user.role))
            if (items.length === 0) return null
            return (
              <div key={section.title} className="nav-section">
                <h2>{section.title}</h2>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="user-box">
          <span>
            {user.username} ({user.role})
          </span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

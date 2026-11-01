import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import NotificationBar from './NotificationBar.jsx'
import Wordmark from './Wordmark.jsx'
import Footer from './home/Footer.jsx'
import { BRAND } from '../config/brand.js'
import '../public.css'

// Main navigation.
const NAV = [
  { to: '/rides', label: 'Rides & Entertainment' },
  { to: '/memberships', label: 'Memberships' },
  { to: '/plan', label: 'Plan Your Visit' },
]

// Layout for the public site: top banner, one-row header, page, footer.
// Staff sign in lives in the footer only; the header has one "Member sign in" (or "Staff portal" once a staff member is signed in).
export default function PublicLayout() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const isCustomer = user?.role === 'Customer'
  const isStaff = Boolean(user) && !isCustomer // staff and admins go to their own portal (/staff sends an admin on to /admin)
  const close = () => setMenuOpen(false)

  return (
    <div className="pub" id="top">
      <div className="awning-wrap is-blue" aria-hidden="true">
        <div className="awning" />
      </div>
      <NotificationBar variant="strip" />

      <header className="pub-header">
        <div className="pub-header-inner">
          <Link to="/" className="pub-wordmark" aria-label={`${BRAND.name} home`} onClick={close}>
            <Wordmark tagline={false} est />
          </Link>

          <nav id="pub-nav" className={`pub-nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
            {NAV.map((item) => <NavLink key={item.label} to={item.to} onClick={close}>{item.label}</NavLink>)}
            {isStaff ? (
              <Link to="/staff" className="pub-signin-mobile" onClick={close}>Staff portal</Link>
            ) : (
              <Link to={isCustomer ? '/member' : '/member/login'} className="pub-signin-mobile" onClick={close}>{isCustomer ? 'My account' : 'Member sign in'}</Link>
            )}
          </nav>

          <div className="pub-actions">
            {isStaff ? (
              <Link to="/staff" className="pub-signin">Staff portal</Link>
            ) : (
              <Link to={isCustomer ? '/member' : '/member/login'} className="pub-signin">{isCustomer ? 'My account' : 'Member sign in'}</Link>
            )}
            <Link to="/tickets" className="pub-buy" onClick={close}>Buy Tickets</Link>
            <button type="button" className="pub-menu-button" aria-expanded={menuOpen} aria-controls="pub-nav" onClick={() => setMenuOpen((v) => !v)}>
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
            </button>
          </div>
        </div>
      </header>

      <Outlet />

      <Footer />
    </div>
  )
}

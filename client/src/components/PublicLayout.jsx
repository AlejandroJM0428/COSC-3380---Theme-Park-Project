import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import NotificationBar from './NotificationBar.jsx'
import Wordmark from './Wordmark.jsx'
import { BRAND } from '../config/brand.js'
import '../pages/VisitorPortal.css' // transitional: the body sections still use these styles (removed in Part 6)
import '../public.css'

// Main navigation. Rides, Memberships and Plan point at homepage sections until their own
// pages exist (Part 7), then these three `to` values change to /rides, /memberships, /plan.
const NAV = [
  { to: '/tickets', label: 'Tickets' },
  { to: '/#rides', label: 'Rides & Entertainment', plain: true },
  { to: '/#visit', label: 'Memberships', plain: true },
  { to: '/', label: 'Plan Your Visit', plain: true },
]

// Layout for the public site: notices strip, one-row header, page, footer.
export default function PublicLayout() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const isCustomer = user?.role === 'Customer'
  const close = () => setMenuOpen(false)

  return (
    <div className="pub visitor-portal">
      <NotificationBar variant="strip" />

      <header className="pub-header">
        <div className="pub-header-inner">
          <Link to="/" className="pub-wordmark" aria-label={`${BRAND.name} home`} onClick={close}>
            <Wordmark tagline={false} />
          </Link>

          <nav id="pub-nav" className={`pub-nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
            {NAV.map((item) => (item.plain
              ? <a key={item.label} href={item.to} onClick={close}>{item.label}</a>
              : <NavLink key={item.label} to={item.to} onClick={close}>{item.label}</NavLink>))}
            <Link to={isCustomer ? '/member' : '/member/login'} className="pub-signin-mobile" onClick={close}>{isCustomer ? 'My account' : 'Sign in'}</Link>
          </nav>

          <div className="pub-actions">
            <Link to={isCustomer ? '/member' : '/member/login'} className="pub-signin">{isCustomer ? 'My account' : 'Sign in'}</Link>
            <Link to="/tickets" className="pub-buy" onClick={close}>Buy Tickets</Link>
            <button type="button" className="pub-menu-button" aria-expanded={menuOpen} aria-controls="pub-nav" onClick={() => setMenuOpen((v) => !v)}>
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
            </button>
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <Wordmark tagline={false} light />
          <nav aria-label="Footer">
            <Link to="/tickets">Tickets</Link>
            <a href="/#rides">Rides</a>
            <a href="/#visit">Memberships</a>
            <Link to="/member/login">Member sign in</Link>
            <Link to="/staff/login">Staff sign in</Link>
            <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
          </nav>
        </div>
        <p>{BRAND.name} · Prototype</p>
      </footer>
    </div>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import NotificationBar from './NotificationBar.jsx'
import Wordmark from './Wordmark.jsx'
import { BRAND } from '../config/brand.js'
import '../pages/VisitorPortal.css'

// Shell shared by the member portal (/member) and, later, the guest portal (/guest).
// links: [{ href, label }] shown in the nav. cta: { href, label } shown as the button.
// children: the page content (the hero and the content area).
export default function PortalLayout({ links = [], cta, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <main className="visitor-portal">
      <header className="vp-header">
        <div className="vp-utility">
          <span>{BRAND.name}</span>
          <span className="vp-utility-links">
            <span>{user?.username}</span>
            <button type="button" className="vp-link-button" onClick={() => { logout(); navigate('/') }}>Sign out</button>
          </span>
        </div>
        <div className="vp-navbar">
          <Link to="/" className="visitor-brand" aria-label={`${BRAND.name} home`}>
            <Wordmark />
          </Link>
          <nav className="vp-nav" aria-label="Main navigation">
            {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </nav>
          {cta ? <a href={cta.href} className="vp-buy">{cta.label}</a> : null}
        </div>
      </header>

      <NotificationBar />

      {children}

      <footer className="vp-footer">
        <div className="vp-footer-inner">
          <div className="vp-footer-brand"><Wordmark tagline={false} light /></div>
          <nav aria-label="Footer">
            <Link to="/member/login">Member sign in</Link>
            <Link to="/member/register">Join</Link>
            <Link to="/staff/login">Staff sign in</Link>
            <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
          </nav>
        </div>
        <p>{BRAND.name} · Visitor portal prototype</p>
      </footer>
    </main>
  )
}

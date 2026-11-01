import { Link } from 'react-router-dom'
import Wordmark from '../Wordmark.jsx'
import { BRAND } from '../../config/brand.js'

// Public site footer. The Rides / Memberships / Plan links use homepage anchors until the
// public pages exist (Part 7), then these three `href` values change to /rides, /memberships, /plan.
export default function Footer() {
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div className="pub-footer-brand">
          <Wordmark tagline={false} light />
          <p>{BRAND.tagline}</p>
        </div>

        <nav className="pub-footer-cols" aria-label="Footer">
          <div>
            <h2>Visit</h2>
            <Link to="/tickets">Tickets</Link>
            <a href="/#rides">Rides</a>
            <a href="/#plan">Plan your visit</a>
          </div>
          <div>
            <h2>Memberships</h2>
            <a href="/#visit">Compare tiers</a>
            <Link to="/member/register">Join</Link>
            <Link to="/member/login">Member sign in</Link>
          </div>
          <div>
            <h2>Park team</h2>
            <Link to="/staff/login">Staff sign in</Link>
          </div>
        </nav>
      </div>

      <div className="pub-footer-bottom">
        <span>{BRAND.name} · Prototype</span>
        <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
      </div>
    </footer>
  )
}

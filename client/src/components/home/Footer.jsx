import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/context.js'
import Wordmark from '../Wordmark.jsx'
import { BRAND } from '../../config/brand.js'

// Public site footer.
export default function Footer() {
  const { user, ready } = useAuth()
  const signedIn = user?.role === 'Customer'
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div className="pub-footer-brand">
          <Wordmark tagline={false} light est />
          <p>{BRAND.tagline}</p>
        </div>

        <nav className="pub-footer-cols" aria-label="Footer">
          <div>
            <h2>Visit</h2>
            <Link to="/tickets">Tickets</Link>
            <Link to="/rides">Rides</Link>
            <Link to="/plan">Plan your visit</Link>
          </div>
          <div>
            <h2>Memberships</h2>
            <Link to="/memberships">Compare tiers</Link>
            {signedIn ? <Link to="/member">My account</Link> : ready && (
              <>
                <Link to="/member/register">Join</Link>
                <Link to="/member/login">Member sign in</Link>
              </>
            )}
          </div>
          <div>
            <h2>Park team</h2>
            <Link to="/staff/login">Staff sign in</Link>
          </div>
        </nav>
      </div>

      <div className="pub-footer-bottom">
        <span>{BRAND.name} · Est. {BRAND.established} · Prototype</span>
        <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
      </div>
    </footer>
  )
}

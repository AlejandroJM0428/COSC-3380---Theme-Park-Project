import { Link } from 'react-router-dom'
import Wordmark from './Wordmark.jsx'
import '../login.css'

// The one card for member sign in, member sign up and staff sign in (look and rules are in login.css).
// variant="member" is the white card under the blue awning; variant="staff" adds a navy header.
// `role` tints the staff page (awning and button) once a portal is chosen.
// `title` names the page and picks the link under the card. `heading` is the big line in the card (defaults to the
// title) and `subtitle` is an optional line under it.
export default function AuthShell({ variant = 'member', role, title, heading, subtitle, children }) {
  return (
    <div className={`auth auth-${variant}`} data-role={role || undefined}>
      <div className={variant === 'staff' ? 'awning-wrap' : 'awning-wrap is-blue'} aria-hidden="true">
        <div className="awning" />
      </div>
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-head">
            <Wordmark tagline={false} light={variant === 'staff'} />
            <h1 id="auth-title">{heading || title}</h1>
            {subtitle && <p className="auth-sub">{subtitle}</p>}
          </header>
          <div className="auth-body">{children}</div>
        </section>
        {title === 'Member sign in' && <p className="auth-back">Park employee? <Link to="/staff/login">Staff sign in</Link></p>}
        {title === 'Staff sign in' && <p className="auth-back">Park guest? <Link to="/member/login">Member sign in</Link></p>}
        <p className="auth-back"><Link to="/">← Back to the park home</Link></p>
      </main>
    </div>
  )
}

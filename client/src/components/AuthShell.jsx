import { Link } from 'react-router-dom'
import Wordmark from './Wordmark.jsx'
import '../login.css'

// The frame for the member sign in, member sign up and staff sign in pages.
// variant="member" uses the public site look; variant="staff" uses the staff portal look.
// `role` tints the staff page (awning and button) once a portal is chosen.
export default function AuthShell({ variant = 'member', role, title, children }) {
  const isMemberLogin = variant === 'member' && title === 'Member sign in'
  return (
    <div
     className={`auth auth-${variant} ${isMemberLogin ? 'tv-member-login' : ''}`}
     data-role={role || undefined}
    >
      {variant === 'staff' && (
        <div className="awning-wrap" aria-hidden="true">
          <div className="awning" />
        </div>
      )}
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-head">
            <Wordmark tagline={false} />
            <h1 id="auth-title">
              {isMemberLogin ? 'Welcome Back!' : title}
            </h1>
            {isMemberLogin && (
              <p className="tv-login-subtitle">
                  Sign in to unlock your Thunder Valley adventure.
              </p>
             )}
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

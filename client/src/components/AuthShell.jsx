import { Link } from 'react-router-dom'
import Wordmark from './Wordmark.jsx'
import '../login.css'

// The frame for the member sign in, member sign up and staff sign in pages.
// variant="member" uses the public site look; variant="staff" uses the staff portal look.
export default function AuthShell({ variant = 'member', title, children }) {
  return (
    <div className={`auth auth-${variant}`}>
      {variant === 'staff' && (
        <div className="awning-wrap" aria-hidden="true">
          <div className="awning" />
        </div>
      )}
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-head">
            <Wordmark tagline={false} />
            <h1 id="auth-title">{title}</h1>
          </header>
          <div className="auth-body">{children}</div>
        </section>
        <p className="auth-back"><Link to="/">← Back to the park home</Link></p>
      </main>
    </div>
  )
}

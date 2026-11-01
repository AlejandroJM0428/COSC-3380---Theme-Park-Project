import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCK } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import AuthShell from '../components/AuthShell.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { STAFF_ROLES } from '../config/nav.js'

const portalOf = (role) => (role === 'Admin' ? '/admin' : '/staff')

// Staff sign in: type your username, type your password. The server says which portal you belong to.
// Members have their own page; this one does not link to it.
export default function StaffLogin() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const who = await login(username.trim(), password, 'staff')
      const from = location.state?.from?.pathname
      navigate(from && (from.startsWith('/staff') || from.startsWith('/admin')) ? from : portalOf(who.role), { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // A staff member who is already signed in goes straight to their portal. Wait for the answer first, so the form never flashes.
  if (!ready) return <AuthShell variant="staff" title="Staff sign in"><p className="muted auth-wait">One moment…</p></AuthShell>
  if (user && STAFF_ROLES.includes(user.role) && !busy) return <Navigate to={portalOf(user.role)} replace />

  const canSubmit = !busy && password && username.trim()

  return (
    <AuthShell variant="staff" title="Staff sign in">
      <form onSubmit={handleSubmit} autoComplete="off">
        <ErrorBanner message={error} />
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <button type="submit" className="auth-submit" disabled={!canSubmit}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {USE_MOCK && <p className="muted auth-note">Demo mode: sign in as avery0001, blake0002 or casey0003 with the password &quot;password&quot;.</p>}
      </form>
    </AuthShell>
  )
}

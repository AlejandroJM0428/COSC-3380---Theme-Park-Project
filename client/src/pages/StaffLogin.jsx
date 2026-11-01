import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { listStaffAccounts, USE_MOCK } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import AuthShell from '../components/AuthShell.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { ROLE_INFO, STAFF_ROLES } from '../config/nav.js'

const portalOf = (role) => (role === 'Admin' ? '/admin' : '/staff')
const roleName = (role) => role.replace(/([a-z])([A-Z])/g, '$1 $2')
const portalLabel = (role) => `${roleName(role)} · ${ROLE_INFO[role]?.title ?? ''}`.replace(/ · $/, '')

// Staff sign in: pick a portal, type your username, type your password. Members have their own page; this one does not link to it.
export default function StaffLogin() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [accounts, setAccounts] = useState(null) // null = loading, [] = none, false = could not load
  const [role, setRole] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    listStaffAccounts().then((list) => { if (alive) setAccounts(list) }).catch(() => { if (alive) setAccounts(false) })
    return () => { alive = false }
  }, [])

  // Portals that have at least one account. If the list could not be loaded, offer every portal.
  const roles = useMemo(() => {
    if (accounts === false) return STAFF_ROLES
    if (!accounts) return []
    const present = new Set(accounts.map((a) => a.role))
    return STAFF_ROLES.filter((r) => present.has(r))
  }, [accounts])

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

  const canSubmit = !busy && password && role && username.trim()

  return (
    <AuthShell variant="staff" role={role} title="Staff sign in">
      <form onSubmit={handleSubmit} autoComplete="off">
        <ErrorBanner message={error} />
        <label>
          Portal
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={accounts === null} required autoFocus>
            <option value="">{accounts === null ? 'Loading…' : 'Choose your portal'}</option>
            {roles.map((r) => <option key={r} value={r}>{portalLabel(r)}</option>)}
          </select>
        </label>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <button type="submit" className="auth-submit" disabled={!canSubmit}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {USE_MOCK && <p className="muted auth-note">Demo mode: the password is &quot;password&quot;.</p>}
      </form>
    </AuthShell>
  )
}

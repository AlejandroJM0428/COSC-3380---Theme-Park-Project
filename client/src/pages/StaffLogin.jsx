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

// Staff sign in: pick a portal, pick your name, type your password. Members have their own page; this one does not link to it.
export default function StaffLogin() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [accounts, setAccounts] = useState(null) // null = loading, [] = none, false = could not load
  const [role, setRole] = useState('')
  const [username, setUsername] = useState('')
  const [typed, setTyped] = useState('') // only used when the staff list could not be loaded
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    listStaffAccounts().then((list) => { if (alive) setAccounts(list) }).catch(() => { if (alive) setAccounts(false) })
    return () => { alive = false }
  }, [])

  const roles = useMemo(() => {
    if (!accounts) return []
    const present = new Set(accounts.map((a) => a.role))
    return STAFF_ROLES.filter((r) => present.has(r))
  }, [accounts])
  const names = useMemo(() => (accounts || []).filter((a) => a.role === role), [accounts, role])

  function pickRole(next) {
    setRole(next)
    const pool = (accounts || []).filter((a) => a.role === next)
    setUsername(pool.length === 1 ? pool[0].username : '')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const who = await login(accounts === false ? typed.trim() : username, password, 'staff')
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

  const fallback = accounts === false
  const canSubmit = !busy && password && (fallback ? typed.trim() : username)

  return (
    <AuthShell variant="staff" role={role} title="Staff sign in">
      <form onSubmit={handleSubmit} autoComplete="off">
        <ErrorBanner message={error} />
        {fallback ? (
          <>
            <p className="muted auth-note">The staff list could not be loaded. Type your username instead.</p>
            <label>
              Username
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" spellCheck={false} autoFocus required />
            </label>
          </>
        ) : (
          <>
            <label>
              Portal
              <select value={role} onChange={(e) => pickRole(e.target.value)} disabled={accounts === null} required autoFocus>
                <option value="">{accounts === null ? 'Loading…' : 'Choose your portal'}</option>
                {roles.map((r) => <option key={r} value={r}>{portalLabel(r)}</option>)}
              </select>
            </label>
            <label>
              Name
              <select value={username} onChange={(e) => setUsername(e.target.value)} disabled={!role} required>
                <option value="">{role ? 'Choose your name' : 'Choose a portal first'}</option>
                {names.map((a) => <option key={a.username} value={a.username}>{a.name ? `${a.name}${a.jobTitle ? ` (${a.jobTitle})` : ''}` : a.username}</option>)}
              </select>
            </label>
          </>
        )}
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

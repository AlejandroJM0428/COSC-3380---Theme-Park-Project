import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import AuthShell from '../components/AuthShell.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

// Where each kind of account lands after signing in.
const portalOf = (role) => (role === 'Customer' ? '/member' : role === 'Admin' ? '/admin' : '/staff')

// The page someone was trying to open when the guard sent them here, if their account is allowed to see it.
function returnTo(role, from) {
  if (!from) return null
  if (role === 'Customer') return from.startsWith('/member') ? from : null
  return from.startsWith('/staff') || from.startsWith('/admin') ? from : null
}

// The one sign-in page for members, staff and admins. Same username and password as before; the server says which
// kind of account it is, and this page sends the person to the matching portal.
export default function SignIn() {
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
      const who = await login(username.trim(), password)
      navigate(returnTo(who.role, location.state?.from?.pathname) ?? portalOf(who.role), { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // Wait until we know whether a session exists, so the form never flashes at someone who is already signed in.
  if (!ready) return <AuthShell title="Sign in" heading="Welcome Back!"><p className="muted auth-wait">One moment…</p></AuthShell>
  if (user && !busy) return <Navigate to={returnTo(user.role, location.state?.from?.pathname) ?? portalOf(user.role)} replace />

  const canSubmit = !busy && password && username.trim()

  return (
    <AuthShell title="Sign in" heading="Welcome Back!" subtitle="Sign in to your Beltway Park account.">
      <form onSubmit={handleSubmit}>
        <ErrorBanner message={error} />
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <button type="submit" className="auth-submit" disabled={!canSubmit}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="auth-links">New here? <Link to="/member/register">Create an account</Link></p>
      </form>
    </AuthShell>
  )
}

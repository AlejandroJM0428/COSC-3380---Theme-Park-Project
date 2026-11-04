import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCK } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import AuthShell from '../components/AuthShell.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

// Member (customer) sign in. Staff have their own page; this one does not link to it.
export default function MemberLogin() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const alreadyMember = ready && user?.role === 'Customer'
  const goTo = location.state?.from?.pathname?.startsWith('/member') ? location.state.from.pathname : '/member'

  // Already signed in: go straight to the account (a signed-in member never sees the form flash up first).
  useEffect(() => {
    if (alreadyMember && !busy) navigate(goTo, { replace: true })
  }, [alreadyMember, busy, goTo, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username.trim(), password, 'member')
      navigate(goTo, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // Wait until we know whether a session exists, so the form does not appear and then jump away.
  if (!ready || alreadyMember) return <AuthShell title="Member sign in" heading="Welcome Back!"><p className="muted auth-wait">One moment…</p></AuthShell>

  return (
    <AuthShell title="Member sign in" heading="Welcome Back!" subtitle="Sign in to unlock your Beltway Park adventure.">
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
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {USE_MOCK && <p className="muted auth-note">Demo mode: sign in as customer with password &quot;password&quot;.</p>}
        <p className="auth-links">New here? <Link to="/member/register">Create a member account</Link></p>
      </form>
    </AuthShell>
  )
}

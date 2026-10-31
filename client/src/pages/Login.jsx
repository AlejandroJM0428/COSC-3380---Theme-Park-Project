import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCK } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { PARK_NAME } from '../config/nav.js'

// audience="staff" -> transaction portal login; audience="member" -> customer login
export default function Login({ audience = 'staff' }) {
  const isMember = audience === 'member'
  const { login, logout } = useAuth()
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
      const who = await login(username, password)
      const isCustomer = who.role === 'Customer'
      if (isMember && !isCustomer) {
        logout()
        throw new Error('That is a staff account. Please use the staff sign in.')
      }
      if (!isMember && isCustomer) {
        logout()
        throw new Error('That is a member account. Please use the member sign in.')
      }
      navigate(location.state?.from?.pathname ?? (isMember ? '/member' : '/staff'), { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="awning-wrap">
        <div className="awning" />
      </div>
      <main className="login-main">
          <form className="ticket" onSubmit={handleSubmit}>
          <div className="ticket-head">
            <h1>{PARK_NAME}</h1>
            <p className="muted">{isMember ? 'Member sign in' : 'Staff transaction portal'}</p>
          </div>
          <div className="ticket-tear" />
          <div className="ticket-body">
            <ErrorBanner message={error} />
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            </button>
            {USE_MOCK && (
              <p className="muted">Demo mode: {isMember ? 'sign in as customer' : 'sign in as admin, manager, or cashier'} with password "password".</p>
            )}
            {isMember && (
              <p className="muted">
                New here? <Link to="/member/register">Create a member account</Link>
              </p>
            )}
            <p className="visitor-login-link">
              <Link to="/">← Back to the park home</Link>
              {' · '}
              {isMember ? <Link to="/staff/login">Staff sign in</Link> : <Link to="/member/login">Member sign in</Link>}
            </p>
          </div>
        </form>
      </main>
    </div>
  )
}

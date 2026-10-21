import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCK } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import ErrorBanner from '../components/ErrorBanner.jsx'

export default function Login() {
  const { login } = useAuth()
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
      await login(username, password)
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>Theme Park Management</h1>
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
          <p className="muted">Demo mode: log in as admin, manager, or cashier with password "password".</p>
        )}
      </form>
    </div>
  )
}

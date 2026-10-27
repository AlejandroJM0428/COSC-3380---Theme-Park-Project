import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { PARK_NAME } from '../config/nav.js'

const EMPTY = { username: '', password: '', confirm: '', firstName: '', lastName: '', dob: '', heightCm: '' }

// Member (customer) self sign-up. Reuses the login page styling.
export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      await register({
        username: form.username.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dob: form.dob,
        heightCm: Number(form.heightCm),
      })
      navigate('/member', { replace: true })
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
            <p className="muted">Create a member account</p>
          </div>
          <div className="ticket-tear" />
          <div className="ticket-body">
            <ErrorBanner message={error} />
            <label>
              First name
              <input value={form.firstName} onChange={set('firstName')} maxLength={50} autoFocus required />
            </label>
            <label>
              Last name
              <input value={form.lastName} onChange={set('lastName')} maxLength={50} required />
            </label>
            <label>
              Date of birth
              <input type="date" value={form.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} required />
            </label>
            <label>
              Height (cm)
              <input type="number" min="30" max="260" step="1" value={form.heightCm} onChange={set('heightCm')} required />
            </label>
            <label>
              Username
              <input
                value={form.username}
                onChange={set('username')}
                pattern="[A-Za-z0-9_.\-]{3,50}"
                title="3-50 characters: letters, numbers, dot, dash or underscore"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input type="password" value={form.password} onChange={set('password')} minLength={8} maxLength={72} autoComplete="new-password" required />
            </label>
            <label>
              Confirm password
              <input type="password" value={form.confirm} onChange={set('confirm')} minLength={8} maxLength={72} autoComplete="new-password" required />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            <p className="visitor-login-link">
              <Link to="/member/login">Already a member? Sign in</Link>
              {' · '}
              <Link to="/">Back to the park home</Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  )
}

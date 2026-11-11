import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/context.js'
import { closePark, getParkClosure, reopenPark } from '../api/index.js'
import { OPS_ROLES } from '../config/nav.js'
import './ParkClosurePanel.css'

// One-click "Close park for weather" / "Reopen park" for Admin and the Operations desk (Manager).
// It is a shortcut over the weather form below it: closing logs a Severe weather event, reopening ends it.
// The server checks the role again, so hiding this panel is only for tidiness.
const TYPES = ['Storm', 'Rain', 'Heat', 'Cold']

export default function ParkClosurePanel({ onChanged }) {
  const { user } = useAuth()
  const allowed = OPS_ROLES.includes(user?.role)
  const [status, setStatus] = useState(null) // { closed, weatherType, since } or null while loading
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [weatherType, setWeatherType] = useState('Storm')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      getParkClosure()
        .then((s) => {
          setStatus(s)
          setError('')
        })
        .catch((e) => setError(e.message)),
    [],
  )

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return null

  const closed = Boolean(status?.closed)

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      if (closed) {
        await reopenPark({ note })
        setMessage('The park is open again. Sales and rides resume.')
      } else {
        await closePark({ weatherType, note })
        setMessage('The park is closed for weather. Sales and boardings are blocked until you reopen it.')
      }
      setConfirming(false)
      setNote('')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`pcp ${closed ? 'pcp-closed' : ''}`} aria-label="Close or reopen the park for weather">
      <div className="pcp-head">
        <strong>{status == null ? 'Checking the park status...' : closed ? `Park closed for weather (${status.weatherType}, since ${String(status.since ?? '').slice(0, 16)})` : 'Park open'}</strong>
        {status != null && !confirming && (
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => { setMessage(''); setConfirming(true) }}>
            {closed ? 'Reopen park' : 'Close park for weather'}
          </button>
        )}
      </div>

      {confirming && (
        <div className="pcp-confirm">
          <p>
            {closed
              ? 'Reopen the park? Ticket sales for today, purchases, game plays and ride boardings resume.'
              : 'Close the whole park? Ticket sales for today, purchases, game plays and ride boardings stop until you reopen it.'}
          </p>
          {!closed && (
            <label>
              Weather
              <select value={weatherType} onChange={(e) => setWeatherType(e.target.value)} disabled={busy}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Note (saved in the audit log)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} disabled={busy} />
          </label>
          <div className="pcp-actions">
            <button type="button" className="pt-btn pt-btn-sm" onClick={confirm} disabled={busy}>
              {busy ? 'Working...' : closed ? 'Confirm reopen' : 'Confirm close'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {message && <p className="pcp-msg" role="status">{message}</p>}
      {error && <p className="pcp-err" role="alert">{error}</p>}
    </section>
  )
}

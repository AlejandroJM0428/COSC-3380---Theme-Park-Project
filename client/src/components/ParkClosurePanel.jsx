import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/context.js'
import { closePark, getParkClosure, reopenPark } from '../api/index.js'
import useParkClock from '../hooks/useParkClock.js'
import usePersistedState from '../hooks/usePersistedState.js'
import { clockLabel } from '../utils/parkTime.js'
import './ParkClosurePanel.css'

// Park status banner with one-click "Close park for weather" / "Reopen park". Admin only: everyone else who can see the
// Weather Log sees the same banner with the button greyed out ("Insufficient privileges").
// Green "Park is in operation" while the park is open; red "Park is closed" when it is closed (outside opening hours, or closed for weather).
// It is a shortcut over the weather form below it: closing logs a Severe weather event, reopening ends it.
// The server checks the role again, so hiding this panel is only for tidiness.
const TYPES = ['Storm', 'Rain', 'Heat', 'Cold']

const VIEW_ROLES = ['Admin', 'Manager', 'RetailManager'] // same as CAN_SEE in server/routes/parkClosure.js
const NO_RIGHTS = 'Insufficient privileges: only an Admin can close or reopen the park.'

// onChanged: called after this panel closes or reopens the park (the log list reloads).
// refreshKey: change it (the log was edited) and the banner reloads the park status at once.
export default function ParkClosurePanel({ onChanged, refreshKey = 0 }) {
  const { user } = useAuth()
  const allowed = VIEW_ROLES.includes(user?.role)
  const canClose = user?.role === 'Admin'
  const [status, setStatus] = useState(null) // { closed, weatherType, since } or null while loading
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = usePersistedState('closure.actionError', '') // a refused close or reopen stays through a refresh
  const [confirming, setConfirming] = useState(false)
  const [weatherType, setWeatherType] = useState('Storm')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const clock = useParkClock() // opening hours + weather, refreshed every 10 seconds

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

  // Check on load, then every 15 seconds, so a closure made by someone else shows up here too.
  useEffect(() => {
    if (!allowed) return undefined
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [allowed, load, refreshKey])

  if (!allowed) return null

  const closed = Boolean(status?.closed) // closed for weather (the button decides on this)
  const hoursKnown = clock.mode !== 'unknown'
  const afterHours = !closed && clock.mode === 'closed'
  const operating = !closed && (clock.mode === 'open' || clock.mode === 'happyhour')
  const stateClass = closed || afterHours ? 'pcp-closed' : operating ? 'pcp-open' : ''
  let headline = 'Checking the park status...'
  let detail = ''
  if (closed) {
    headline = 'Park is closed'
    detail = `Closed for weather (${status.weatherType}) since ${String(status.since ?? '').slice(0, 16).replace('T', ' ')}. Sales and ride boardings are blocked.`
  } else if (status != null && hoursKnown) {
    if (afterHours) {
      headline = 'Park is closed'
      detail = clock.openAt != null ? `Outside opening hours. ${clock.opensTomorrow ? 'Opens tomorrow at' : 'Opens today at'} ${clockLabel(clock.openAt)}.` : 'Outside opening hours.'
    } else {
      headline = 'Park is in operation'
      detail = clock.closeAt != null ? `Open until ${clockLabel(clock.closeAt)}.` : ''
    }
  } else if (status != null) {
    headline = closed ? 'Park is closed' : 'Park is in operation'
  }

  async function confirm() {
    setBusy(true)
    setError('')
    setActionError('')
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
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`pcp ${stateClass}`} aria-label="Park status: close or reopen the park for weather">
      <div className="pcp-head">
        <div className="pcp-state">
          <span className="pcp-dot" aria-hidden="true" />
          <div>
            <strong className="pcp-title">{headline}</strong>
            {detail && <div className="pcp-detail">{detail}</div>}
          </div>
        </div>
        {status != null && !confirming && (
          <div className="pcp-btnwrap">
            <button
              type="button"
              className={`pt-btn pt-btn-sm ${canClose ? '' : 'pcp-locked'}`}
              disabled={!canClose}
              title={canClose ? undefined : NO_RIGHTS}
              onClick={() => { setMessage(''); setConfirming(true) }}
            >
              {closed ? 'Reopen park' : 'Close park for weather'}
            </button>
            {!canClose && <span className="pcp-lockmsg">Insufficient privileges (Admin only)</span>}
          </div>
        )}
      </div>

      {confirming && canClose && (
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
      {actionError && <p className="pcp-err" role="alert">{actionError}</p>}
    </section>
  )
}

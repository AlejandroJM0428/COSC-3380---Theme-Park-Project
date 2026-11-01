import { useEffect, useState } from 'react'
import { listNotifications } from '../api/index.js'
import './NotificationBar.css'

const DISMISS_KEY = 'park.notices.dismissed'

// Active notifications (sold out, weather, maintenance closed, promos). Made by database triggers,
// except promos which staff type in. Shows nothing if there are none or the server is unreachable.
//   variant="default": the stacked boxes used in the portals.
//   variant="strip":   a slim, dismissible site-wide strip (public site, above the header).
export default function NotificationBar({ variant = 'default' }) {
  const [items, setItems] = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) || '' } catch { return '' }
  })

  useEffect(() => {
    let alive = true
    listNotifications()
      .then((data) => alive && setItems(Array.isArray(data) ? data : []))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [])

  if (items.length === 0) return null

  if (variant === 'strip') {
    // Dismissal is remembered for this browser tab, and only for this exact set of notices.
    const signature = items.slice(0, 3).map((n) => n.NotificationID).join(',')
    if (dismissed === signature) return null
    const worst = items.some((n) => n.Severity === 'Alert') ? 'alert' : items.some((n) => n.Severity === 'Warning') ? 'warning' : 'info'
    const dismiss = () => {
      setDismissed(signature)
      try { sessionStorage.setItem(DISMISS_KEY, signature) } catch { /* private mode: fine */ }
    }
    return (
      <section className={`notice-strip notice-strip-${worst}`} aria-label="Park notices">
        <div className="notice-strip-inner">
          <p>
            {items.slice(0, 3).map((n, i) => (
              <span key={n.NotificationID}>{i > 0 ? <span aria-hidden="true"> · </span> : null}<strong>{n.Title}:</strong> {n.Message}</span>
            ))}
          </p>
          <button type="button" className="notice-strip-close" aria-label="Dismiss park notices" onClick={dismiss}>×</button>
        </div>
      </section>
    )
  }

  return (
    <section className="notice-bar" aria-label="Park notices">
      {items.slice(0, 5).map((n) => (
        <p key={n.NotificationID} className={`notice notice-${String(n.Severity).toLowerCase()}`}>
          <strong>{n.Title}:</strong> {n.Message}
        </p>
      ))}
    </section>
  )
}

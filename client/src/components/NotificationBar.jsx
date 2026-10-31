import { useEffect, useState } from 'react'
import { listNotifications } from '../api/index.js'
import './NotificationBar.css'

// Active notifications (sold out, weather, maintenance closed, promos). Made by database triggers,
// except promos which staff type in. Shows nothing if there are none or the server is unreachable.
export default function NotificationBar() {
  const [items, setItems] = useState([])

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

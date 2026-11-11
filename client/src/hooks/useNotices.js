import { useEffect, useState } from 'react'
import { listNotifications } from '../api/index.js'

// Active park notices (sold out, weather, maintenance, new or retired rides, promos). Empty until the first answer.
// Refreshes every 10 seconds so a new notice shows within about 10 s of the database trigger posting it.
// The timer stops while the tab is hidden, and the list is fetched again the moment the tab comes back or gets focus.
// A failed refresh keeps the last good list instead of blanking the banner.
const POLL_MS = 10 * 1000

export default function useNotices() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    let timer = null
    const load = () => {
      listNotifications()
        .then((data) => alive && setItems(Array.isArray(data) ? data : []))
        .catch(() => {})
    }
    const start = () => {
      if (timer == null) timer = setInterval(load, POLL_MS)
    }
    const stop = () => {
      if (timer != null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load()
        start()
      } else {
        stop()
      }
    }

    load()
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', load)
    }
  }, [])

  return items
}

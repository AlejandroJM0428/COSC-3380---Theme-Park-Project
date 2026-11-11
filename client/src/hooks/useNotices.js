import { useEffect, useState } from 'react'
import { listNotifications } from '../api/index.js'

// Active park notices (sold out, weather, maintenance, promos). Empty if there are none or the server is
// unreachable. Refreshes every 5 minutes so a new notice shows without a page reload.
export default function useNotices() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    const load = () => {
      listNotifications()
        .then((data) => alive && setItems(Array.isArray(data) ? data : []))
        .catch(() => alive && setItems([]))
    }
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return items
}

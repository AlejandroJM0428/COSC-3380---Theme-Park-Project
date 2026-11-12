import { useEffect, useState } from 'react'
import { getPublicSite } from '../api/index.js'

// How often the public site data is fetched again. Ride Open/Closed follows the WeatherLog (outdoor rides close and
// reopen with weather entries), so a page that is left open must keep up. The server also caches for 15 s.
const REFRESH_MS = 10 * 1000

// Loads the anonymous public site data (prices, hours, tiers, rides, venues). Never contains wait times.
// Returns { site, loading, error, retry }. It re-fetches every 10 seconds; a failed refresh keeps the last good data.
export default function usePublicSite() {
  const [state, setState] = useState({ site: null, error: '', done: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      getPublicSite()
        .then((site) => { if (alive) setState({ site, error: '', done: true }) })
        .catch((err) => {
          if (!alive) return
          // Only the first load shows an error; later failures keep what is on screen.
          setState((prev) => (prev.site ? prev : { ...prev, error: err.message || 'Could not load the park information.', done: true }))
        })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [attempt])

  return { site: state.site, loading: !state.done, error: state.error, retry: () => setAttempt((n) => n + 1) }
}

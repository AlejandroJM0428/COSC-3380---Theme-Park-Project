import { useEffect, useState } from 'react'
import { getPublicSite } from '../api/index.js'

// Loads the anonymous public site data (prices, hours, tiers, rides, venues). Never contains wait times.
// Returns { site, loading, error, retry }.
export default function usePublicSite() {
  const [state, setState] = useState({ site: null, error: '', done: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    getPublicSite()
      .then((site) => { if (alive) setState({ site, error: '', done: true }) })
      .catch((err) => { if (alive) setState((prev) => ({ ...prev, error: err.message || 'Could not load the park information.', done: true })) })
    return () => { alive = false }
  }, [attempt])

  return { site: state.site, loading: !state.done, error: state.error, retry: () => setAttempt((n) => n + 1) }
}

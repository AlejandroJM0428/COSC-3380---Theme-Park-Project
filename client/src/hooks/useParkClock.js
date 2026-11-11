import { useEffect, useState } from 'react'
import { getPublicSite } from '../api/index.js'
import { parkMinutes, parkStatus, readPreview } from '../utils/parkTime.js'

// The park's opening hours, fetched once and shared by everything that asks for them.
let hoursRequest = null
function loadHours() {
  if (!hoursRequest) {
    hoursRequest = getPublicSite()
      .then((site) => site?.hours ?? null)
      .catch(() => {
        hoursRequest = null // try again next time
        return null
      })
  }
  return hoursRequest
}

// What the park is doing right now, in park time: { mode, hours, openAt, closeAt, ... }.
// mode is 'unknown' | 'closed' | 'happyhour' | 'open'. It re-checks every 30 seconds.
export default function useParkClock() {
  const [hours, setHours] = useState(null)
  const [now, setNow] = useState(() => parkMinutes())
  const [preview] = useState(() => readPreview())

  useEffect(() => {
    let alive = true
    loadHours().then((h) => { if (alive) setHours(h) })
    const timer = setInterval(() => setNow(parkMinutes()), 30000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return { ...parkStatus({ hours, now, preview }), hours, preview }
}

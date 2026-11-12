import { useEffect, useState } from 'react'
import { getPublicSite } from '../api/index.js'
import { parkMinutes, parkStatus, readPreview } from '../utils/parkTime.js'

// The park's opening hours and any weather closure, shared by everything that asks for them.
// Hours rarely change, but weather can close the park at any moment, so the answer is reused for at most
// ten seconds and then fetched again, so a weather closure shows within about 10 s.
const REFRESH_MS = 10 * 1000
let infoRequest = null
let loadedAt = 0
function loadParkInfo() {
  if (!infoRequest || Date.now() - loadedAt >= REFRESH_MS - 500) {
    loadedAt = Date.now()
    infoRequest = getPublicSite()
      .then((site) => ({ hours: site?.hours ?? null, weather: site?.weather ?? null }))
      .catch(() => {
        infoRequest = null // try again next time
        return null
      })
  }
  return infoRequest
}

// What the park is doing right now, in park time: { mode, reason, hours, weather, openAt, closeAt, ... }.
// mode is 'unknown' | 'closed' | 'happyhour' | 'open'. reason is 'weather' when severe weather closed it.
// It re-checks every 10 seconds.
export default function useParkClock() {
  const [info, setInfo] = useState({ hours: null, weather: null })
  const [now, setNow] = useState(() => parkMinutes())
  const [preview] = useState(() => readPreview())

  useEffect(() => {
    let alive = true
    // A failed refresh keeps the last good answer instead of blanking the banner.
    const refresh = () => loadParkInfo().then((next) => { if (alive && next) setInfo(next) })
    refresh()
    const timer = setInterval(() => {
      setNow(parkMinutes())
      refresh()
    }, 10000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return { ...parkStatus({ hours: info.hours, weather: info.weather, now, preview }), hours: info.hours, weather: info.weather, preview }
}

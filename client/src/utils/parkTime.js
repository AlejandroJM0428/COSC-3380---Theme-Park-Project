import { BRAND } from '../config/brand.js'


// Park time helpers. The park is in Houston, so "open", "closed" and "Happy Hour" follow the park clock
// (BRAND.timeZone), not the visitor's own clock.

const PREVIEW_KEY = 'park.preview'
export const PREVIEWS = ['closed', 'happyhour']

// "HH:MM" (or "HH:MM:SS") to minutes after midnight. Returns null for anything else.
export function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''))
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h > 23 || m > 59 ? null : h * 60 + m
}

// Minutes after midnight right now in the park's time zone.
export function parkMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BRAND.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  const m = Number(parts.find((p) => p.type === 'minute')?.value)
  return h * 60 + m
}

// "17:30" -> "5:30 PM"
export function clockLabel(value) {
  const mins = typeof value === 'number' ? value : toMinutes(value)
  if (mins == null) return ''
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}

// "1 hr 5 min", "42 min"
export function durationLabel(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

// A forced mode for previewing: ?preview=closed or ?preview=happyhour. It is remembered for the browser tab so it
// survives clicking around the site. ?preview=off clears it.
export function readPreview() {
  try {
    const asked = new URLSearchParams(window.location.search).get('preview')
    if (asked === 'off') sessionStorage.removeItem(PREVIEW_KEY)
    else if (PREVIEWS.includes(asked)) sessionStorage.setItem(PREVIEW_KEY, asked)
    const saved = sessionStorage.getItem(PREVIEW_KEY)
    return PREVIEWS.includes(saved) ? saved : ''
  } catch {
    return ''
  }
}

// Works out what the park is doing right now.
//   hours:   { open: 'HH:MM', close: 'HH:MM' } from the database (null until it loads)
//   weather: the weather closure in effect now, from /api/public/site (null when there is none)
//   now:     minutes after midnight, park time
//   preview: '', 'closed' or 'happyhour'
// mode is 'unknown' (hours not loaded yet), 'closed', 'happyhour' or 'open'.
// reason is 'weather' when a Severe weather event has closed the park, including after opening hours.
export function parkStatus({ hours, weather = null, now, preview = '' }) {
  const status = clockStatus({ hours, now, preview })
  if (weather?.closesPark) {
    return { ...status, mode: 'closed', reason: 'weather', opensTomorrow: false, minutesToOpen: null, minutesLeft: null }
  }
  return { ...status, reason: null }
}

// The park's state from its hours alone (and the preview override), ignoring weather.
function clockStatus({ hours, now, preview }) {
  const openAt = toMinutes(hours?.open)
  const closeAt = toMinutes(hours?.close)
  const hhStart = toMinutes(BRAND.happyHour.start)
  const hhEnd = toMinutes(BRAND.happyHour.end)

  if (openAt == null || closeAt == null) {
    // Without hours we can still show a preview; otherwise stay quiet rather than guess.
    if (preview === 'closed') return { mode: 'closed', openAt: null, closeAt: null, opensTomorrow: false, minutesToOpen: null, minutesLeft: null }
    if (preview === 'happyhour') return { mode: 'happyhour', openAt: null, closeAt: null, opensTomorrow: false, minutesToOpen: null, minutesLeft: hhEnd - hhStart }
    return { mode: 'unknown', openAt, closeAt, opensTomorrow: false, minutesToOpen: null, minutesLeft: null }
  }

  const isOpen = now >= openAt && now < closeAt
  const isHappy = isOpen && now >= hhStart && now < hhEnd
  // A forced "closed" preview during open hours reads as if the park had already closed for the day.
  const forcedClosed = preview === 'closed' && isOpen
  const opensTomorrow = now >= closeAt || forcedClosed
  const minutesToOpen = isOpen && !forcedClosed ? 0 : opensTomorrow ? 24 * 60 - now + openAt : openAt - now

  let mode = isHappy ? 'happyhour' : isOpen ? 'open' : 'closed'
  let minutesLeft = isHappy ? hhEnd - now : null
  if (preview === 'closed') mode = 'closed'
  if (preview === 'happyhour') {
    mode = 'happyhour'
    minutesLeft = isHappy ? hhEnd - now : hhEnd - hhStart
  }
  return { mode, openAt, closeAt, opensTomorrow: mode === 'closed' && opensTomorrow, minutesToOpen, minutesLeft }
}

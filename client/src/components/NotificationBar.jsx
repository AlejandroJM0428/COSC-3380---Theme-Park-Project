import { useState } from 'react'
import useNotices from '../hooks/useNotices.js'
import useParkClock from '../hooks/useParkClock.js'
import { BRAND } from '../config/brand.js'
import { clockLabel, durationLabel } from '../utils/parkTime.js'
import './NotificationBar.css'

// What was closed since the page loaded. It is kept in memory only, so a refresh brings every notice back for as
// long as it is active on the server. Moving between pages does not bring them back.
let seenThisLoad = []
let dismissedThisLoad = ''

// Park notices (sold out, weather, maintenance closed, promos). Made by database triggers, except promos
// which staff type in. Shows nothing if there are none or the server is unreachable.
//   variant="default": the stacked boxes used in the portals.
//   variant="strip":   the public site's top banner. It is one of three things, in this order:
//                      1. a scrolling ticker while the park is closed,
//                      2. a scrolling ticker during Happy Hour,
//                      3. one notice at a time (with "+N more") when there is anything to say.
export default function NotificationBar({ variant = 'default' }) {
  return variant === 'strip' ? <TopBanner /> : <NoticeList />
}

// Portal notices: ONE card at a time instead of a stack of boxes. "Next" steps through them and the last one
// says "Got it". After the last one the card is gone until the next refresh. A new or reworded notice shows up again.
const seenKeyOf = (n) => `${n.NotificationID}|${n.CreatedAt}|${n.Message}`

function NoticeList() {
  const items = useNotices()
  const [seen, setSeen] = useState(seenThisLoad)
  const markSeen = (keys) => {
    setSeen((list) => {
      seenThisLoad = [...new Set([...list, ...keys])].slice(-100)
      return seenThisLoad
    })
  }

  const unread = items.filter((n) => !seen.includes(seenKeyOf(n)))
  if (unread.length === 0) return null

  const current = unread[0]
  const position = items.length - unread.length + 1
  const isLast = unread.length === 1
  const severity = String(current.Severity).toLowerCase()

  return (
    <section
      className={`notice-card notice-${severity} notice-kind-${String(current.Kind).toLowerCase()}`}
      aria-label="Park notices"
    >
      <div className="notice-card-body" aria-live="polite">
        <p className="notice-card-title"><strong>{current.Title}</strong></p>
        <p className="notice-card-message">{current.Message}</p>
      </div>
      <div className="notice-card-actions">
        {items.length > 1 && <span className="notice-card-count">{position} of {items.length}</span>}
        <button type="button" className="notice-card-next" onClick={() => markSeen([seenKeyOf(current)])}>
          {isLast ? 'Got it' : 'Next'}
        </button>
        {!isLast && (
          <button type="button" className="notice-card-close" aria-label="Dismiss all park notices" onClick={() => markSeen(unread.map(seenKeyOf))}>×</button>
        )}
      </div>
    </section>
  )
}

function TopBanner() {
  const notices = useNotices()
  const park = useParkClock()
  const [dismissed, setDismissed] = useState(dismissedThisLoad)

  const showTicker = park.mode === 'closed' || park.mode === 'happyhour'
  // Closing the banner lasts until the page is refreshed, for this mode and this exact set of notices.
  // When the park goes from closed to open, Happy Hour starts, or weather closes the park, the new mode shows again.
  const mode = park.reason === 'weather' ? 'closed-weather' : park.mode
  const signature = `${showTicker ? mode : 'notices'}:${notices.slice(0, 3).map((n) => n.NotificationID).join(',')}`
  const dismiss = () => {
    dismissedThisLoad = signature
    setDismissed(signature)
  }
  if (dismissed === signature) return null

  const noticeLines = notices.slice(0, 3).map((n) => `${n.Title}: ${n.Message}`)

  // Severe weather (SQL/migrations/27_weather_severity.sql). The weather notice itself is already in noticeLines.
  if (park.reason === 'weather') {
    const lines = [`${BRAND.name} is closed right now due to severe weather`, 'Every ride is closed until the weather clears']
    return <Ticker mode="closed" tag="Weather" lines={[...lines, ...noticeLines, BRAND.tagline]} onDismiss={dismiss} />
  }

  if (park.mode === 'closed') {
    const lines = [`${BRAND.name} is closed right now`]
    if (park.openAt != null) {
      const when = `${park.opensTomorrow ? 'tomorrow' : 'today'} at ${clockLabel(park.openAt)}`
      lines.push(`Opens ${when}${park.minutesToOpen ? ` (in ${durationLabel(park.minutesToOpen)})` : ''}`)
      lines.push(`Park hours ${clockLabel(park.openAt)} to ${clockLabel(park.closeAt)}`)
    }
    return <Ticker mode="closed" tag="Closed" lines={[...lines, ...noticeLines, BRAND.tagline]} onDismiss={dismiss} />
  }

  if (park.mode === 'happyhour') {
    const lines = [...BRAND.happyHour.lines]
    lines.push(park.minutesLeft ? `Ends at ${clockLabel(BRAND.happyHour.end)} (${durationLabel(park.minutesLeft)} left)` : `Ends at ${clockLabel(BRAND.happyHour.end)}`)
    return <Ticker mode="happyhour" tag="Happy Hour" lines={[...lines, ...noticeLines, BRAND.tagline]} onDismiss={dismiss} />
  }

  if (notices.length === 0) return null
  return <NoticeStrip notices={notices} onDismiss={dismiss} />
}

// One notice at a time. "+2 more" steps through the rest.
function NoticeStrip({ notices, onDismiss }) {
  const [index, setIndex] = useState(0)
  const list = notices.slice(0, 3)
  const current = list[index % list.length]
  const severity = String(current.Severity).toLowerCase()
  return (
    <section className="notice-strip" aria-label="Park notices">
      <div className="notice-strip-inner">
        {severity !== 'info' && <span className={`notice-tag notice-tag-${severity}`}>{current.Severity}</span>}
        <p><strong>{current.Title}:</strong> {current.Message}</p>
        {list.length > 1 && (
          <button type="button" className="notice-more" onClick={() => setIndex((i) => (i + 1) % list.length)} aria-label="Show the next notice">
            {index === 0 ? `+${list.length - 1} more` : `${index + 1} of ${list.length}`}
          </button>
        )}
        <button type="button" className="notice-strip-close" aria-label="Dismiss park notices" onClick={onDismiss}>×</button>
      </div>
    </section>
  )
}

// The scoreboard ticker: a tag on the left, text crawling right to left in a seamless loop, like the
// ribbon board around an arena. A pause button and reduced-motion support keep it usable for everyone.
function Ticker({ mode, tag, lines, onDismiss }) {
  const [paused, setPaused] = useState(false)

  // Repeat the lines until one pass is wider than a big screen, so the loop never shows a gap.
  const passChars = lines.reduce((sum, line) => sum + line.length + 6, 0)
  const reps = Math.max(1, Math.ceil(320 / passChars))
  const seconds = Math.max(20, Math.round(passChars * reps * 0.09))

  const group = (copy) => (
    <div className={`ticker-group${copy ? ' ticker-copy' : ''}`}>
      {Array.from({ length: reps }).flatMap((_, r) =>
        lines.map((line, i) => (
          <span key={`${r}-${i}`} className={`ticker-item${r > 0 ? ' ticker-rep' : ''}`}>
            {line}
            <span className="ticker-dot" aria-hidden="true">◆</span>
          </span>
        )),
      )}
    </div>
  )

  return (
    <section className={`ticker ticker-${mode}${paused ? ' is-paused' : ''}`} aria-label={mode === 'closed' ? 'Park is closed' : 'Happy Hour'}>
      <span className="ticker-tag">{tag}</span>
      <p className="sr-only">{lines.map((line) => line.replace(/[.!]$/, '')).join('. ')}</p>
      <div className="ticker-window" aria-hidden="true">
        <div className="ticker-track" style={{ '--ticker-seconds': `${seconds}s` }}>
          {group(false)}
          {group(true)}
        </div>
      </div>
      <button type="button" className="ticker-btn" aria-pressed={paused} aria-label={paused ? 'Play scrolling banner' : 'Pause scrolling banner'} onClick={() => setPaused((p) => !p)}>
        {paused ? '▶' : '❚❚'}
      </button>
      <button type="button" className="ticker-btn ticker-close" aria-label="Dismiss banner" onClick={onDismiss}>×</button>
    </section>
  )
}

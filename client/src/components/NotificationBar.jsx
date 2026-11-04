import { useState } from 'react'
import useNotices from '../hooks/useNotices.js'
import useParkClock from '../hooks/useParkClock.js'
import { BRAND } from '../config/brand.js'
import { clockLabel, durationLabel } from '../utils/parkTime.js'
import './NotificationBar.css'

const DISMISS_KEY = 'park.notices.dismissed'

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

function NoticeList() {
  const items = useNotices()
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

function TopBanner() {
  const notices = useNotices()
  const park = useParkClock()
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) || '' } catch { return '' }
  })

  const showTicker = park.mode === 'closed' || park.mode === 'happyhour'
  // Closing the banner is remembered for this browser tab, for this mode and this exact set of notices.
  // When the park goes from closed to open, or Happy Hour starts, the new mode shows again.
  const signature = `${showTicker ? park.mode : 'notices'}:${notices.slice(0, 3).map((n) => n.NotificationID).join(',')}`
  const dismiss = () => {
    setDismissed(signature)
    try { sessionStorage.setItem(DISMISS_KEY, signature) } catch { /* private mode: fine */ }
  }
  if (dismissed === signature) return null

  const noticeLines = notices.slice(0, 3).map((n) => `${n.Title}: ${n.Message}`)

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

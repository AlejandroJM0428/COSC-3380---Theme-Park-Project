import { useEffect, useRef, useState } from 'react'
import useNotices from '../hooks/useNotices.js'
import './NoticePopup.css'

// Centered pop-up for the notices that matter most: maintenance, weather, and rides added or taken out of service.
// It shows every time the page loads for as long as the notice is active on the server, so a refresh brings it
// back. Closing it (the X button, "Got it", a click on the backdrop, Esc, or after 8 seconds; the timer pauses
// while the mouse or keyboard focus is on it) only hides it until the next refresh, and moving between pages
// does not show it again. Nothing is written to the browser: the server's list of active notices is the memory.
// After it closes the notice is still in the banner, which is not touched by this component.
// If several notices are active, they show one at a time.
const SHOW_MS = 8000
const POPUP_KINDS = new Set(['Weather', 'Maintenance', 'MaintenanceClosed', 'RideAdded', 'RideDeactivated'])

// A notice that is posted again (a ride goes down a second time, a weather event is reworded) keeps its id,
// so the key also holds the time and the text. A new version of a notice pops up again.
const keyOf = (n) => `${n.NotificationID}|${n.CreatedAt}|${n.Message}`

// Notices closed since the page loaded. It lives in memory, so a refresh empties it and the notices come back.
let closedThisLoad = []

export default function NoticePopup() {
  const notices = useNotices()
  const [popped, setPoppedState] = useState(closedThisLoad)
  const setPopped = (update) => {
    setPoppedState((list) => {
      closedThisLoad = typeof update === 'function' ? update(list) : update
      return closedThisLoad
    })
  }
  const current = notices.find((n) => POPUP_KINDS.has(n.Kind) && !popped.includes(keyOf(n))) ?? null
  const currentKey = current ? keyOf(current) : null
  const [paused, setPaused] = useState(false)
  const closeRef = useRef(null)
  const leftRef = useRef(SHOW_MS)
  const startedRef = useRef(0)

  const close = () => {
    if (currentKey == null) return
    setPopped((list) => (list.includes(currentKey) ? list : [...list, currentKey]))
    setPaused(false)
  }

  // A new notice starts with a full 8 seconds and the close button focused.
  useEffect(() => {
    if (currentKey == null) return undefined
    leftRef.current = SHOW_MS
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    }
  }, [currentKey])

  // The 8 second timer. Hover or focus pauses it and keeps what is left.
  useEffect(() => {
    if (currentKey == null || paused) return undefined
    startedRef.current = Date.now()
    const id = setTimeout(() => {
      setPopped((list) => (list.includes(currentKey) ? list : [...list, currentKey]))
    }, leftRef.current)
    return () => {
      clearTimeout(id)
      leftRef.current = Math.max(1000, leftRef.current - (Date.now() - startedRef.current))
    }
  }, [currentKey, paused])

  // Esc closes it.
  useEffect(() => {
    if (currentKey == null) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setPopped((list) => (list.includes(currentKey) ? list : [...list, currentKey]))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [currentKey])

  if (!current) return null
  const severity = String(current.Severity).toLowerCase()
  const queued = notices.filter((n) => POPUP_KINDS.has(n.Kind) && !popped.includes(keyOf(n))).length - 1

  return (
    <div className="notice-popup-backdrop" onClick={close}>
      <div
        className={`notice-popup notice-popup-${severity} notice-popup-kind-${String(current.Kind).toLowerCase()}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-popup-title"
        aria-describedby="notice-popup-message"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus() } }}
      >
        <button type="button" ref={closeRef} className="notice-popup-x" aria-label="Close notice" onClick={close}>×</button>
        <p className="notice-popup-tag">Park notice</p>
        <h2 id="notice-popup-title">{current.Title}</h2>
        <p id="notice-popup-message" className="notice-popup-message">{current.Message}</p>
        {queued > 0 && <p className="notice-popup-more">{queued} more notice{queued === 1 ? '' : 's'} to read</p>}
        <button type="button" className="notice-popup-ok" onClick={close}>Got it</button>
      </div>
    </div>
  )
}

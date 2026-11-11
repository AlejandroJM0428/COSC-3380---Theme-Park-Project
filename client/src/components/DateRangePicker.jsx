import { useEffect, useRef, useState } from 'react'
import './DateRangePicker.css'

// Pick a date range by clicking: quick buttons (Today, Last 7 days...) or two clicks on the calendar. Nothing is typed.
//   <DateRangePicker from="2026-10-01" to="2026-10-31" onChange={({ from, to }) => ...} />
// from / to are 'YYYY-MM-DD' strings ('' = no limit). `min` / `max` (same format) grey out days outside them.
// Dates are worked out from the calendar day on this computer, not from a time of day, so they never shift by a timezone.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0 to 11
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d } }
const fromDate = (t) => iso(t.getFullYear(), t.getMonth(), t.getDate())
const todayIso = () => fromDate(new Date())
const addDays = (s, n) => { const { y, m, d } = parse(s); return fromDate(new Date(y, m, d + n)) }
const pretty = (s) => { const { y, m, d } = parse(s); return `${MONTHS[m].slice(0, 3)} ${d}, ${y}` }

function presetList(today) {
  const { y, m } = parse(today)
  const monthStart = iso(y, m, 1)
  const lastMonthStart = fromDate(new Date(y, m - 1, 1))
  const lastMonthEnd = fromDate(new Date(y, m, 0))
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'This month', from: monthStart, to: today },
    { label: 'Last month', from: lastMonthStart, to: lastMonthEnd },
    { label: 'This year', from: iso(y, 0, 1), to: today },
    { label: 'All dates', from: '', to: '' },
  ]
}

export default function DateRangePicker({ from = '', to = '', onChange, min = '', max = '', label = 'Date range' }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState('') // first click of a new range, waiting for the second
  const [hover, setHover] = useState('')
  const start = from || todayIso()
  const [view, setView] = useState(() => { const { y, m } = parse(start); return { y, m } })
  const box = useRef(null)
  const today = todayIso()

  // Close on a click outside or on Escape.
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) close() }
    const key = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])

  function close() { setOpen(false); setAnchor(''); setHover('') }
  function toggle() {
    if (open) { close(); return }
    const { y, m } = parse(from || today)
    setView({ y, m })
    setOpen(true)
  }
  function choose(f, t) { onChange({ from: f, to: t }); close() }
  function shift(months) {
    setView((v) => { const t = new Date(v.y, v.m + months, 1); return { y: t.getFullYear(), m: t.getMonth() } })
  }
  function pickDay(day) {
    if (!anchor) { setAnchor(day); return }
    choose(anchor <= day ? anchor : day, anchor <= day ? day : anchor)
  }

  // Which range to paint: the one being chosen (anchor to the day under the mouse) or the saved one.
  const paintFrom = anchor ? (hover && hover < anchor ? hover : anchor) : from
  const paintTo = anchor ? (hover && hover > anchor ? hover : anchor) : to

  const first = new Date(view.y, view.m, 1)
  const cells = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  for (let d = 1; d <= new Date(view.y, view.m + 1, 0).getDate(); d++) cells.push(iso(view.y, view.m, d))

  const text = from && to ? (from === to ? pretty(from) : `${pretty(from)} – ${pretty(to)}`) : from ? `From ${pretty(from)}` : to ? `Up to ${pretty(to)}` : 'Any date'

  return (
    <div className="drp" ref={box}>
      <button type="button" className="drp-button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${text}`} onClick={toggle}>
        <span aria-hidden="true">📅</span> {text}
      </button>
      {open && (
        <div className="drp-pop" role="dialog" aria-label={label}>
          <div className="drp-presets">
            {presetList(today).map((p) => (
              <button key={p.label} type="button" className={p.from === from && p.to === to ? 'is-on' : ''} onClick={() => choose(p.from, p.to)}>{p.label}</button>
            ))}
          </div>
          <div className="drp-cal">
            <div className="drp-nav">
              <button type="button" aria-label="Previous year" onClick={() => shift(-12)}>«</button>
              <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
              <strong>{MONTHS[view.m]} {view.y}</strong>
              <button type="button" aria-label="Next month" onClick={() => shift(1)}>›</button>
              <button type="button" aria-label="Next year" onClick={() => shift(12)}>»</button>
            </div>
            <div className="drp-grid" onMouseLeave={() => setHover('')}>
              {DAYS.map((d) => <span key={d} className="drp-dow">{d}</span>)}
              {cells.map((day, i) => {
                if (!day) return <span key={`b${i}`} />
                const off = (min && day < min) || (max && day > max)
                const inRange = paintFrom && paintTo && day >= paintFrom && day <= paintTo
                const cls = ['drp-day', inRange && 'in-range', day === paintFrom && 'is-start', day === paintTo && 'is-end', day === today && 'is-today'].filter(Boolean).join(' ')
                return (
                  <button key={day} type="button" className={cls} disabled={Boolean(off)} aria-pressed={Boolean(inRange)} onMouseEnter={() => setHover(day)} onClick={() => pickDay(day)}>
                    {parse(day).d}
                  </button>
                )
              })}
            </div>
            <p className="drp-hint">{anchor ? `Now click the last day (started ${pretty(anchor)}).` : 'Click a first day, then a last day. Or use a quick button.'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

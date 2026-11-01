import { useState } from 'react'
import { monthWeeks, parseDay } from '../../utils/saleDates.js'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// A small month calendar for choosing a visit date. Past dates and sold-out dates cannot be picked;
// sold-out dates are crossed out and say "sold out" to screen readers.
//   value, min: "YYYY-MM-DD"    soldOut: a Set of "YYYY-MM-DD"    labelId: id of the field's visible label
export default function SaleDatePicker({ value, min, soldOut, onChange, labelId }) {
  const [open, setOpen] = useState(false)
  const selected = parseDay(value)
  const [view, setView] = useState({ year: selected.getFullYear(), month: selected.getMonth() })

  const minDate = parseDay(min)
  const atEarliestMonth = view.year === minDate.getFullYear() && view.month === minDate.getMonth()
  const monthName = new Date(view.year, view.month, 1, 12).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const weeks = monthWeeks(view.year, view.month)
  const hasSoldOut = weeks.flat().some((day) => day && soldOut.has(day))

  const step = (delta) => {
    const next = new Date(view.year, view.month + delta, 1, 12)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <div className="pub-dp">
      <button type="button" className="pub-dp-toggle" aria-expanded={open} aria-labelledby={`${labelId} pub-dp-value`} onClick={() => setOpen((v) => !v)}>
        <span id="pub-dp-value">{selected.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="pub-dp-panel" role="group" aria-label="Choose a visit date">
          <div className="pub-dp-head">
            <button type="button" onClick={() => step(-1)} disabled={atEarliestMonth} aria-label="Previous month">‹</button>
            <strong aria-live="polite">{monthName}</strong>
            <button type="button" onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <table className="pub-dp-grid">
            <thead>
              <tr>{WEEKDAYS.map((d) => <th key={d} scope="col">{d}</th>)}</tr>
            </thead>
            <tbody>
              {weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((day, i) => {
                    if (!day) return <td key={i} />
                    const sold = soldOut.has(day)
                    const past = day < min
                    const label = parseDay(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    return (
                      <td key={day}>
                        <button
                          type="button"
                          className={`pub-dp-day${day === value ? ' on' : ''}${sold ? ' sold' : ''}`}
                          disabled={sold || past}
                          aria-pressed={day === value}
                          aria-label={sold ? `${label}, sold out` : label}
                          onClick={() => { onChange(day); setOpen(false) }}
                        >
                          {Number(day.slice(8))}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {hasSoldOut && <p className="pub-dp-legend"><span className="pub-dp-key" aria-hidden="true">8</span> Crossed out means sold out</p>}
        </div>
      )}
    </div>
  )
}

import './DateTimeField.css'

// Date and time in two quick clicks. Replaces <input type="datetime-local">, whose pop-up needs many clicks.
//   value / onChange use the same text as before: "2026-11-14T07:00" (or "" when empty), so forms and payloads do not change.
//   - Date: the browser's date picker (one click on a day).
//   - Time: a list in 15-minute steps ("7:00 AM"). Picking a time with no date fills in today; picking a date with no time fills in the current time.
//   - Now: sets both to this moment.   - Clear: empties an optional field (not shown when `required`).
const pad = (n) => String(n).padStart(2, '0')
const dateText = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeText = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// "HH:mm" -> "7:05 AM"
function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

const SLOTS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`)

// The current time rounded to the nearest 15 minutes, so it matches a slot.
function nowSlot() {
  const d = new Date()
  const total = Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15
  const clamped = Math.min(total, 23 * 60 + 45)
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`
}

export default function DateTimeField({ id, value, onChange, required = false, disabled = false }) {
  const [date = '', time = ''] = String(value ?? '').split('T')
  const hhmm = time.slice(0, 5)
  const options = hhmm && !SLOTS.includes(hhmm) ? [...SLOTS, hhmm].sort() : SLOTS // keep an existing odd time such as 7:07 AM

  const join = (d, t) => (d ? `${d}T${t || nowSlot()}` : '')

  return (
    <div className="dtf" role="group" aria-label="Date and time">
      <input
        id={id}
        type="date"
        value={date}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(join(e.target.value, hhmm))}
      />
      <select
        aria-label="Time"
        value={hhmm}
        disabled={disabled}
        onChange={(e) => onChange(`${date || dateText(new Date())}T${e.target.value}`)}
      >
        {hhmm === '' && <option value="">Time</option>}
        {options.map((t) => (
          <option key={t} value={t}>
            {timeLabel(t)}
          </option>
        ))}
      </select>
      <button type="button" className="dtf-btn" disabled={disabled} onClick={() => onChange(`${dateText(new Date())}T${timeText(new Date())}`)}>
        Now
      </button>
      {!required && value && (
        <button type="button" className="dtf-btn dtf-clear" disabled={disabled} onClick={() => onChange('')}>
          Clear
        </button>
      )}
    </div>
  )
}

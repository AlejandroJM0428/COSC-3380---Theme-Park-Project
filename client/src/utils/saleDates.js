// Small date helpers for the ticket date picker. Dates are "YYYY-MM-DD" strings, worked out at noon local
// time so a daylight-saving change never moves a day.

export function parseDay(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function formatDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addDays(iso, days) {
  const date = parseDay(iso)
  date.setDate(date.getDate() + days)
  return formatDay(date)
}

// The first date on or after `from` that is not sold out. Gives up after a year and returns `from`.
export function firstOpenDate(from, soldOut) {
  let day = from
  for (let i = 0; i < 366; i += 1) {
    if (!soldOut.has(day)) return day
    day = addDays(day, 1)
  }
  return from
}

// The weeks of one month as rows of 7 cells: a "YYYY-MM-DD" string, or null for padding before and after.
export function monthWeeks(year, month) {
  const first = new Date(year, month, 1, 12)
  const count = new Date(year, month + 1, 0, 12).getDate()
  const cells = Array(first.getDay()).fill(null)
  for (let d = 1; d <= count; d += 1) cells.push(formatDay(new Date(year, month, d, 12)))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

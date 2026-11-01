import { LANDS } from '../config/brand.js'

// Shared by the homepage, the member portal and (later) the guest portal.
export function localDate(offset = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0)
}

export function statusTone(status) {
  if (status === 'Open') return 'open'
  if (status === 'Closed - Retired') return 'retired'
  return 'closed'
}


export function rideImage(zoneName) {
  return (LANDS.find((land) => land.zones.includes(zoneName)) ?? LANDS[1]).img
}

// "07:30" or "22:00" -> "7:30 AM" / "10:00 PM"
export function clock(value) {
  const [h, m] = String(value ?? '').split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

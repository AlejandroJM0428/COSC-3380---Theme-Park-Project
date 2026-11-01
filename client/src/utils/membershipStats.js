// Stats for the Membership tab.
//
// Some numbers are REAL (worked out from the membership and the tickets the portal already has):
//   days left, visits booked this term, visits until the membership has paid for itself.
// The rest are PLACEHOLDERS (sample: true) until the park records them per member. The tab shows a
// small "Sample" badge on those tiles. To replace one, return it from here with sample: false,
// or later from the server as dashboard.stats and map it in buildStats().

const DAY = 24 * 60 * 60 * 1000
const at = (iso) => new Date(`${iso}T12:00:00`).getTime()

// Placeholder tiles. Change the values here and nothing else.
export const SAMPLE_TILES = [
  { key: 'rides', icon: '🎢', label: 'Rides ridden', value: '42', note: 'across 9 different rides' },
  { key: 'favourite', icon: '⭐', label: 'Favourite ride', value: 'Kirby Drive Launch', note: 'ridden 7 times' },
  { key: 'zone', icon: '🗺️', label: 'Favourite zone', value: 'The Loop', note: '38% of your boardings' },
  { key: 'wait', icon: '⏱️', label: 'Time in queues', value: '3h 10m', note: 'avg 14 min per ride' },
  { key: 'streak', icon: '🔥', label: 'Visit streak', value: '3 weeks', note: 'visited 3 weeks in a row' },
  { key: 'day', icon: '📅', label: 'Favourite day', value: 'Saturday', note: 'most of your visits' },
]

// Placeholder "level" bar.
export const SAMPLE_LEVEL = { name: 'Adventurer', next: 'Thrill Seeker', pct: 62, sample: true }

export function buildStats({ membership, tickets = [], dayPassPrice = 59 }) {
  if (!membership) return null
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const start = at(membership.startDate)
  const end = at(membership.endDate)
  const totalDays = Math.max(1, Math.round((end - start) / DAY) + 1)
  const usedDays = Math.min(totalDays, Math.max(0, Math.round((today.getTime() - start) / DAY) + 1))
  const daysLeft = Math.max(0, Math.round((end - today.getTime()) / DAY))

  const visits = tickets.filter((t) => t.status !== 'Refunded' && t.visitDate >= membership.startDate && t.visitDate <= membership.endDate).length
  const breakEven = Math.max(1, Math.ceil(membership.annualPrice / Math.max(1, dayPassPrice)))
  const toGo = Math.max(0, breakEven - visits)

  return {
    daysLeft,
    termPct: Math.round((usedDays / totalDays) * 100),
    real: [
      { key: 'left', icon: '⏳', label: 'Days left', value: String(daysLeft), note: `of ${totalDays} in your term` },
      { key: 'visits', icon: '🎟️', label: 'Visits booked', value: String(visits), note: 'this membership year' },
      {
        key: 'even',
        icon: '💰',
        label: 'Pays for itself',
        value: toGo === 0 ? 'Done!' : `${toGo} more`,
        note: toGo === 0 ? `${breakEven} visits covers the price` : `visit${toGo === 1 ? '' : 's'} to cover the price`,
      },
    ],
    sample: SAMPLE_TILES,
    level: SAMPLE_LEVEL,
  }
}

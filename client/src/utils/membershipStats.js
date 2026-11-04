// Stats for the Membership tab.
//
// Every number is worked out from the member's own membership and tickets (days left, visits booked this term,
// visits until the membership has paid for itself). Nothing is invented. A new member sees their own starting
// numbers, not someone else's. Ride-by-ride stats (favourite ride, streak) return when the park records them per member.

const DAY = 24 * 60 * 60 * 1000
const at = (iso) => new Date(`${iso}T12:00:00`).getTime()

// The blurred preview a non-member sees: the names of the stats they would unlock, with no numbers.
export const PREVIEW_TILES = [
  { key: 'left', icon: '⏳', label: 'Days left', value: '—', note: 'in your term' },
  { key: 'visits', icon: '🎟️', label: 'Visits booked', value: '—', note: 'this membership year' },
  { key: 'even', icon: '💰', label: 'Pays for itself', value: '—', note: 'visits to cover the price' },
]

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
  }
}

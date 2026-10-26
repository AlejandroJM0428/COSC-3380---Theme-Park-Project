// Demo-only data for the customer portal. All changes stay in memory and are lost on refresh.
const pause = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms))

function dateOffset(offset) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayString() {
  return dateOffset(0)
}

const visitor = {
  customerId: 42,
  firstName: 'Alex',
  lastName: 'Morgan',
  membership: {
    membershipId: 2204,
    tier: 'Plus',
    startDate: dateOffset(-207),
    endDate: dateOffset(158),
    annualPrice: 149,
    autoRenew: true,
    benefits: ['Any-day admission', 'Standard queues included', 'Bring-your-own-day flexibility'],
  },
}

let tickets = [
  {
    ticketId: 6001,
    visitDate: dateOffset(6),
    hasExpress: false,
    ticketPrice: 0,
    purchaseDate: dateOffset(-2),
    status: 'Confirmed',
  },
  {
    ticketId: 5998,
    visitDate: dateOffset(13),
    hasExpress: true,
    ticketPrice: 25,
    purchaseDate: dateOffset(-5),
    status: 'Confirmed',
  },
  {
    ticketId: 5987,
    visitDate: dateOffset(-7),
    hasExpress: false,
    ticketPrice: 0,
    purchaseDate: dateOffset(-14),
    status: 'Used',
  },
  {
    ticketId: 5982,
    visitDate: dateOffset(-12),
    hasExpress: true,
    ticketPrice: 25,
    purchaseDate: dateOffset(-20),
    status: 'Refunded',
    refundedAt: dateOffset(-16),
  },
]

const rides = [
  { rideId: 3, rideName: 'Thunder Run', zoneName: 'Thunder Canyon', currentState: 'Open', waitMinutes: 35, updatedLabel: 'Demo estimate' },
  { rideId: 2, rideName: 'Grand Carousel', zoneName: 'Main Street', currentState: 'Open', waitMinutes: 7, updatedLabel: 'Demo estimate' },
  { rideId: 5, rideName: 'Rapids Rampage', zoneName: 'Thunder Canyon', currentState: 'Closed - Weather', waitMinutes: null, updatedLabel: 'Demo status' },
  { rideId: 6, rideName: "Pirate's Plunge", zoneName: 'Adventure Bay', currentState: 'Open', waitMinutes: 22, updatedLabel: 'Demo estimate' },
  { rideId: 7, rideName: "Kraken's Lair", zoneName: 'Adventure Bay', currentState: 'Open', waitMinutes: 18, updatedLabel: 'Demo estimate' },
  { rideId: 8, rideName: 'Tidal Simulator', zoneName: 'Adventure Bay', currentState: 'Open', waitMinutes: 13, updatedLabel: 'Demo estimate' },
  { rideId: 9, rideName: 'Enchanted Journey', zoneName: 'Fantasy Forest', currentState: 'Open', waitMinutes: 9, updatedLabel: 'Demo estimate' },
  { rideId: 10, rideName: 'Forest Express', zoneName: 'Fantasy Forest', currentState: 'Closed - Maintenance', waitMinutes: null, updatedLabel: 'Demo status' },
  { rideId: 11, rideName: "Wizard's Workshop", zoneName: 'Fantasy Forest', currentState: 'Open', waitMinutes: 5, updatedLabel: 'Demo estimate' },
  { rideId: 12, rideName: "Dragon's Nest", zoneName: 'Fantasy Forest', currentState: 'Closed - Maintenance', waitMinutes: null, updatedLabel: 'Demo status' },
  { rideId: 14, rideName: 'Little Dino Dash', zoneName: 'Kids Corner', currentState: 'Open', waitMinutes: 8, updatedLabel: 'Demo estimate' },
  { rideId: 15, rideName: 'Mini Carousel', zoneName: 'Kids Corner', currentState: 'Open', waitMinutes: 4, updatedLabel: 'Demo estimate' },
  { rideId: 13, rideName: 'Old Mill Ride', zoneName: 'Fantasy Forest', currentState: 'Closed - Retired', waitMinutes: null, updatedLabel: 'Demo status' },
]

function snapshot() {
  return {
    customer: { customerId: visitor.customerId, firstName: visitor.firstName, lastName: visitor.lastName },
    membership: { ...visitor.membership, benefits: [...visitor.membership.benefits] },
    prices: { dayPass: 79, expressAddOn: 25 },
    tickets: tickets.map((ticket) => ({ ...ticket })),
    rides: rides.map((ride) => ({ ...ride })),
    dataMode: 'demo',
  }
}

export async function getVisitorDashboard() {
  await pause()
  return snapshot()
}

export async function buyVisitorTicket({ visitDate, hasExpress }) {
  await pause()
  if (typeof visitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    throw new Error('Choose a valid visit date.')
  }
  if (visitDate < todayString()) throw new Error('Visit date cannot be in the past.')
  if (visitor.membership.tier === 'Basic') {
    const day = new Date(`${visitDate}T12:00:00`).getDay()
    if (day === 0 || day === 6) throw new Error('Basic membership is valid on weekdays only.')
  }
  const includesExpress = visitor.membership.tier === 'Premier'
  const ticket = {
    ticketId: Math.max(6000, ...tickets.map((t) => t.ticketId)) + 1,
    visitDate,
    hasExpress: Boolean(hasExpress || includesExpress),
    ticketPrice: hasExpress && !includesExpress ? 25 : 0,
    purchaseDate: todayString(),
    status: 'Confirmed',
  }
  tickets = [ticket, ...tickets]
  return { ...ticket }
}

export async function refundVisitorTicket(ticketId) {
  await pause()
  const ticket = tickets.find((item) => item.ticketId === Number(ticketId))
  if (!ticket) throw new Error('Ticket not found.')
  if (ticket.status === 'Refunded') throw new Error('This ticket has already been refunded.')
  if (ticket.visitDate <= todayString()) throw new Error('Only tickets for a future visit can be refunded in this demo.')
  ticket.status = 'Refunded'
  ticket.refundedAt = todayString()
  return { ...ticket }
}

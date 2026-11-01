import { formatDate, money } from '../../utils/portalFormat.js'

// Overview: next visit, membership, ride status and quick actions. Dense cards, no images.
export default function OverviewTab({ customer, membership, upcoming, rides, onGo }) {
  const next = upcoming[0]
  const openCount = rides.filter((r) => r.currentState === 'Open').length

  return (
    <>
      <p className="pt-greeting">{customer ? `Welcome back, ${customer.firstName}.` : 'Welcome back.'}</p>

      <div className="pt-cards">
        <article className="pt-card">
          <h2>Next visit</h2>
          <p className="pt-big">{next ? formatDate(next.visitDate) : 'None booked'}</p>
          <p className="pt-sub">{next ? `Ticket #${next.ticketId} · ${next.hasExpress ? 'Express' : 'Standard queues'}` : 'No upcoming visits yet.'}</p>
          <button type="button" className="pt-link" onClick={() => onGo('tickets')}>{next ? 'Manage tickets' : 'Buy a ticket'} →</button>
        </article>

        <article className="pt-card">
          <h2>Membership</h2>
          <p className="pt-big">{membership ? membership.tier : 'None'}</p>
          <p className="pt-sub">{membership ? `Valid through ${formatDate(membership.endDate)} · ${money(membership.annualPrice)}/yr` : 'No active membership.'}</p>
          <button type="button" className="pt-link" onClick={() => onGo('membership')}>Details →</button>
        </article>

        <article className="pt-card">
          <h2>Rides</h2>
          <p className="pt-big">{openCount} <small>of {rides.length} open</small></p>
          <p className="pt-sub">{rides.length - openCount} closed or out of service.</p>
          <button type="button" className="pt-link" onClick={() => onGo('rides')}>Ride board →</button>
        </article>
      </div>

      <h2 className="pt-h2">Quick actions</h2>
      <div className="pt-actions">
        <button type="button" className="pt-btn" onClick={() => onGo('tickets')}>Buy a ticket</button>
        <button type="button" className="pt-btn pt-btn-ghost" onClick={() => onGo('rides')}>View ride board</button>
      </div>
    </>
  )
}

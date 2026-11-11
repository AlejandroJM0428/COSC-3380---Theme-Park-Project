import { formatDate, money } from '../../utils/portalFormat.js'
import MembershipBuy from './MembershipBuy.jsx'

// Overview: next visit, membership, ride status and quick actions. Dense cards, no images.
// A customer without a membership also gets a compact "join now" card with the tier picker.
export default function OverviewTab({ customer, membership, tiers, upcoming, rides, onGo, onBuyMembership, buyingMembership }) {
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
          <p className="pt-sub">{membership ? `Valid through ${formatDate(membership.endDate)} · ${money(membership.annualPrice)}/yr` : 'No active membership yet.'}</p>
          <button type="button" className="pt-link" onClick={() => onGo('membership')}>{membership ? 'See your stats' : 'See what you get'} →</button>
        </article>

        <article className="pt-card">
          <h2>Rides</h2>
          <p className="pt-big">{openCount} <small>of {rides.length} open</small></p>
          <p className="pt-sub">{rides.length - openCount} closed or out of service.</p>
          <button type="button" className="pt-link" onClick={() => onGo('rides')}>Ride board →</button>
        </article>
      </div>

      {!membership && (
        <section className="pt-card pt-join" aria-labelledby="pt-join-title">
          <div className="pt-join-copy">
            <p className="pt-pitch-kicker">Members only</p>
            <h2 id="pt-join-title" className="pt-join-title">Get a membership</h2>
            <p className="pt-sub">Admission built in, live wait times and your own park stats.</p>
          </div>
          <MembershipBuy tiers={tiers} onBuy={onBuyMembership} busy={buyingMembership} compact />
        </section>
      )}

      <h2 className="pt-h2">Quick actions</h2>
      <div className="pt-actions">
        <button type="button" className="pt-btn pt-btn-buy" onClick={() => onGo('tickets')}>Buy a ticket</button>
        <button type="button" className="pt-btn pt-btn-ghost" onClick={() => onGo('rides')}>View ride board</button>
      </div>
    </>
  )
}

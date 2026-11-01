import { Link } from 'react-router-dom'
import { formatDate, money } from '../../utils/portalFormat.js'

// Membership: the member's tier, dates and benefits. Customers without one are pointed at the tier comparison.
export default function MembershipTab({ membership }) {
  if (!membership) {
    return (
      <section className="pt-card">
        <h2>No active membership</h2>
        <p className="pt-sub">Members get admission built in, plus live wait times in this portal.</p>
        <Link to="/memberships" className="pt-link">Compare tiers →</Link>
      </section>
    )
  }

  return (
    <section className="pt-card pt-narrow">
      <h2>{membership.tier} member <span className="pt-pill">Active</span></h2>
      <dl className="pt-dl">
        <div><dt>Valid through</dt><dd>{formatDate(membership.endDate)}</dd></div>
        <div><dt>Annual membership</dt><dd>{money(membership.annualPrice)}</dd></div>
      </dl>
      {membership.benefits?.length > 0 && (
        <>
          <h3 className="pt-h3">Benefits</h3>
          <ul className="pt-ticks">{membership.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
        </>
      )}
    </section>
  )
}

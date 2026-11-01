import { Link } from 'react-router-dom'
import { money } from '../../utils/portalFormat.js'

// Two-column promo: day pass + Express on the left, membership tiers on the right.
// Prices come from the public site data and are display only.
export default function TicketsMembershipsPromo({ prices, tiers = [] }) {
  const dayPass = prices?.dayPass
  const express = prices?.expressAddOn

  return (
    <section className="pub-section" id="visit" aria-labelledby="pub-promo-title">
      <h2 id="pub-promo-title" className="pub-h2">Tickets &amp; memberships</h2>
      <div className="pub-promo">
        <article className="pub-promo-panel pub-promo-tickets">
          <p className="pub-eyebrow">Day pass</p>
          <p className="pub-promo-price">{dayPass != null ? <>from <strong>{money(dayPass)}</strong></> : <strong>Day passes</strong>}</p>
          <p>
            {express != null
              ? `Add Express queue access for ${money(express)} and skip the long queues.`
              : 'Add Express queue access and skip the long queues.'}
          </p>
          <Link to="/tickets" className="pub-buy">Buy Tickets</Link>
        </article>

        <article className="pub-promo-panel pub-promo-members">
          <p className="pub-eyebrow">Memberships</p>
          <p className="pub-promo-lead">Admission built in, all year.</p>
          {tiers.length > 0 && (
            <ul className="pub-tier-list">
              {tiers.map((tier) => (
                <li key={tier.tier}>
                  <span><strong>{tier.tier}</strong><small>{tier.benefits?.[0]}</small></span>
                  <b>{money(tier.annualPrice)}<small>/yr</small></b>
                </li>
              ))}
            </ul>
          )}
          <Link to="/member/register" className="pub-ghost">Join</Link>
        </article>
      </div>
    </section>
  )
}

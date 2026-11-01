import { useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../../utils/portalFormat.js'

// Compare membership tiers one at a time instead of listing them all. Prices are display only.
export default function MembershipPicker({ tiers = [] }) {
  const [chosen, setChosen] = useState(null)
  if (tiers.length === 0) return null

  const tier = tiers.find((t) => t.tier === chosen) ?? tiers[Math.min(1, tiers.length - 1)]

  return (
    <article className="pub-panel" aria-labelledby="pub-mem-title">
      <p className="pub-eyebrow">Memberships</p>
      <h2 id="pub-mem-title" className="pub-panel-title">Come back all year</h2>

      <div className="pub-segment" role="group" aria-label="Choose a membership">
        {tiers.map((t) => (
          <button key={t.tier} type="button" aria-pressed={t.tier === tier.tier} onClick={() => setChosen(t.tier)}>{t.tier}</button>
        ))}
      </div>

      <p className="pub-panel-price"><strong>{money(tier.annualPrice)}</strong><small> per year</small></p>
      <ul className="pub-checks">
        {(tier.benefits ?? []).map((b) => <li key={b}>{b}</li>)}
      </ul>
      <div className="pub-panel-actions">
        <Link to="/member/register" className="pub-buy">Create a free account</Link>
        <Link to="/memberships" className="pub-link">Compare all →</Link>
      </div>
    </article>
  )
}

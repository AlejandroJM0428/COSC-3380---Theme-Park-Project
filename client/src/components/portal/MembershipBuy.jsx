import { useState } from 'react'
import { money } from '../../utils/portalFormat.js'

const MOST_POPULAR = 'Plus'

// Tier picker + buy button, shared by the Overview card and the Membership tab.
//   tiers:   [{ tier, annualPrice, benefits[] }] from the dashboard
//   onBuy:   ({ tier, autoRenew }) => Promise. The server sets the dates and the price.
//   busy:    true while a purchase is in flight (the button locks, and the page also ignores a second click)
//   compact: smaller cards for the Overview
export default function MembershipBuy({ tiers, onBuy, busy, compact = false }) {
  const [tier, setTier] = useState(() => (tiers.some((t) => t.tier === MOST_POPULAR) ? MOST_POPULAR : tiers[0]?.tier ?? ''))
  const [autoRenew, setAutoRenew] = useState(true)
  const chosen = tiers.find((t) => t.tier === tier)

  if (tiers.length === 0) return <p className="pt-fine">Memberships are not on sale right now.</p>

  return (
    <form
      className={`pt-mb ${compact ? 'pt-mb-compact' : ''}`}
      onSubmit={(e) => { e.preventDefault(); if (chosen && !busy) onBuy({ tier: chosen.tier, autoRenew }) }}
    >
      <fieldset className="pt-mb-tiers" disabled={busy}>
        <legend className="sr-only">Choose a membership tier</legend>
        {tiers.map((t) => (
          <label key={t.tier} className={`pt-mb-tier ${t.tier === tier ? 'on' : ''}`}>
            <input type="radio" name={compact ? 'tier-compact' : 'tier'} value={t.tier} checked={t.tier === tier} onChange={() => setTier(t.tier)} />
            {t.tier === MOST_POPULAR && <span className="pt-mb-flag">Most popular</span>}
            <strong>{t.tier}</strong>
            <span className="pt-mb-price">{money(t.annualPrice)}<small>/yr</small></span>
            {!compact && <ul className="pt-ticks">{t.benefits.map((b) => <li key={b}>{b}</li>)}</ul>}
          </label>
        ))}
      </fieldset>

      {!compact && (
        <label className="pt-check pt-mb-renew" htmlFor="pt-renew">
          <input id="pt-renew" type="checkbox" checked={autoRenew} disabled={busy} onChange={(e) => setAutoRenew(e.target.checked)} />
          <span>Renew automatically<small>You can turn this off any time.</small></span>
          <span />
        </label>
      )}

      <div className="pt-mb-foot">
        <p className="pt-fine">Starts today and lasts one year. No payment is taken in this prototype.</p>
        <button type="submit" className="pt-btn" disabled={busy || !chosen}>
          {busy ? 'Setting up…' : `Get ${chosen?.tier ?? ''} for ${money(chosen?.annualPrice ?? 0)}`}
        </button>
      </div>
    </form>
  )
}

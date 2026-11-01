import { formatDate, money } from '../../utils/portalFormat.js'
import { buildStats, SAMPLE_TILES } from '../../utils/membershipStats.js'
import CancelMembership from './CancelMembership.jsx'
import MembershipBuy from './MembershipBuy.jsx'

const Tile = ({ t }) => (
  <article className="pt-stat">
    <span className="pt-stat-icon" aria-hidden="true">{t.icon}</span>
    <p className="pt-stat-label">{t.label}{t.sample && <span className="pt-sample" title="Placeholder until the park records this per member">Sample</span>}</p>
    <p className="pt-stat-value">{t.value}</p>
    <p className="pt-stat-note">{t.note}</p>
  </article>
)

// Membership. Two looks:
//   member:     a stats page (term progress, level, stat tiles, perks, benefits).
//   not member: a "get one now" pitch with a blurred preview of the stats and the tier picker.
// A member also gets the cancellation request card at the bottom (components/portal/CancelMembership.jsx).
// Real numbers come from buildStats(); tiles marked Sample are placeholders (see utils/membershipStats.js).
export default function MembershipTab({ membership, perks, tiers, tickets, dayPassPrice, onBuy, buying, messages }) {
  if (!membership) {
    return (
      <div className="pt-getone">
        <section className="pt-card pt-pitch">
          <p className="pt-pitch-kicker">Members only</p>
          <h2 className="pt-pitch-title">Unlock your own park stats</h2>
          <p className="pt-pitch-sub">Join and we will track every ride, every streak and every minute you skip in a queue. Plus admission built in, live wait times and welcome perks.</p>
          <div className="pt-preview" aria-hidden="true">
            {SAMPLE_TILES.slice(0, 3).map((t) => <Tile key={t.key} t={{ ...t, sample: false }} />)}
            <span className="pt-lock">🔒</span>
          </div>
        </section>
        <section className="pt-card">
          <h2>Pick your tier</h2>
          <MembershipBuy tiers={tiers} onBuy={onBuy} busy={buying} />
        </section>
      </div>
    )
  }

  const stats = buildStats({ membership, tickets, dayPassPrice })
  const tiles = [...stats.real, ...stats.sample.map((t) => ({ ...t, sample: true }))]

  return (
    <>
      <section className="pt-card pt-hero">
        <div className="pt-hero-top">
          <div>
            <p className="pt-hero-kicker">Your membership</p>
            <h2 className="pt-hero-title">{membership.tier} member <span className="pt-pill">Active</span></h2>
            <p className="pt-hero-sub">Since {formatDate(membership.startDate)} · valid through {formatDate(membership.endDate)} · {money(membership.annualPrice)}/yr{membership.autoRenew ? ' · renews automatically' : ''}</p>
          </div>
          <div className="pt-level" title="Placeholder level">
            <span className="pt-level-name">{stats.level.name}</span>
            <span className="pt-sample">Sample</span>
          </div>
        </div>
        <div className="pt-meter" role="img" aria-label={`${stats.termPct}% of your membership year used`}>
          <span style={{ width: `${stats.termPct}%` }} />
        </div>
        <div className="pt-meter-labels">
          <span>{stats.termPct}% of your year</span>
          <span>{stats.level.pct}% to {stats.level.next}</span>
        </div>
      </section>

      <h2 className="pt-h2">Your year in the park</h2>
      <div className="pt-stats">{tiles.map((t) => <Tile key={t.key} t={t} />)}</div>

      <div className="pt-two">
        <section className="pt-card">
          <h2>Perks unlocked</h2>
          {perks?.length > 0
            ? <ul className="pt-ticks">{perks.map((p) => <li key={p.name}>{p.name}</li>)}</ul>
            : <p className="pt-sub">No perks yet.</p>}
        </section>
        <section className="pt-card">
          <h2>Benefits</h2>
          <ul className="pt-ticks">{membership.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
      </div>

      <CancelMembership messages={messages} />
    </>
  )
}

import { Link } from 'react-router-dom'
import LoadError from '../components/LoadError.jsx'
import { useAuth } from '../auth/context.js'
import usePublicSite from '../hooks/usePublicSite.js'
import { money } from '../utils/portalFormat.js'

const YES = <span aria-label="Included">✓</span>
const NO = <span aria-label="Not included" className="pub-no">–</span>


const TIER_ICONS = {
  Basic: '🎟️',
  Plus: '⭐',
  Premier: '👑',
}


// Public membership comparison (/memberships). Tiers come from the public site data.
export default function Memberships() {
  const { site, loading, error, retry } = usePublicSite()
  const tiers = site?.tiers ?? []
  const { user } = useAuth()
  const signedIn = user?.role === 'Customer'

  return (
    <main className="pub-page pub-page-wide">
      <h1 className="pub-h1">Memberships</h1>
      <p className="pub-lede">Admission built in, all year. Pick the tier that fits how often you visit.</p>

      {error && <LoadError message={error} onRetry={retry} />}
      {loading && <p className="pub-empty">Loading…</p>}

      {tiers.length > 0 && (
        <>
          
          <div className="pub-tier-cards">
            {tiers.map((t) => (
              <article
                key={t.tier}
                className={`pub-tier-card pub-tier-${t.tier.toLowerCase()}`}
              >
                {t.tier === 'Plus' && (
                  <span className="pub-tier-popular">
                    ★ MOST POPULAR
                  </span>
                )}

                
                <h2 className="membership-tier-heading">
                  <span aria-hidden="true">
                    {TIER_ICONS[t.tier] ?? '🎟️'}
                  </span>
                  {t.tier}
                </h2>


                <p className="pub-tier-price"><strong>{money(t.annualPrice)}</strong><small>/yr</small></p>
                
                <ul className="membership-benefits">
                  {t.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>

                {signedIn
                  ? <Link to="/member?tab=membership" className="pub-buy">My membership</Link>
                  : <Link to="/member/register" className="pub-buy">Join as {t.tier}</Link>}
              </article>
            ))}
          </div>

          <div className="pub-table-wrap">
            <table className="pub-table">
              <caption className="sr-only">Compare membership tiers</caption>
              <thead>
                <tr><th scope="col">Benefit</th>{tiers.map((t) => <th scope="col" key={t.tier}>{t.tier}</th>)}</tr>
              </thead>
              <tbody>
                <tr><th scope="row">Annual price</th>{tiers.map((t) => <td key={t.tier}>{money(t.annualPrice)}</td>)}</tr>
                <tr><th scope="row">Any-day admission</th>{tiers.map((t) => <td key={t.tier}>{t.anyDayAccess ? YES : NO}</td>)}</tr>
                <tr><th scope="row">Express queues included</th>{tiers.map((t) => <td key={t.tier}>{t.includesExpress ? YES : NO}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="pub-note">Basic covers weekday visits.</p>
        </>
      )}
    </main>
  )
}

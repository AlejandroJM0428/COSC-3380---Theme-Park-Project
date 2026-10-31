import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPublicSite } from '../api/index.js'
import BrandImage from '../components/BrandImage.jsx'
import QuickBuy from '../components/QuickBuy.jsx'
import { BRAND, LANDS } from '../config/brand.js'
import { money, rideImage, statusTone } from '../utils/portalFormat.js'

// The public front door (/). No sign-in needed. It never shows wait times or anything personal.
export default function HomePage() {
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rideSearch, setRideSearch] = useState('')
  const [landFilter, setLandFilter] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSite(await getPublicSite())
    } catch (err) {
      setError(err.message || 'Could not load the park information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const passPrice = site?.prices?.dayPass
  const expressPrice = site?.prices?.expressAddOn
  const rides = site?.rides ?? []
  const visibleRides = useMemo(() => rides.filter((ride) => {
    const q = rideSearch.trim().toLowerCase()
    const matchesLand = !landFilter || landFilter.zones.includes(ride.zoneName)
    return matchesLand && (!q || `${ride.rideName} ${ride.zoneName}`.toLowerCase().includes(q))
  }), [rides, rideSearch, landFilter])

  const landsEl = (
    <section className="vp-lands" aria-label="Choose your adventure">
      <h2>Choose Your Adventure</h2>
      <div className="vp-land-grid">
        {LANDS.map((land) => (
          <button type="button" key={land.key} className={`vp-land ${landFilter?.key === land.key ? 'active' : ''}`} style={{ backgroundImage: `url(${land.img})` }}
            onClick={() => { setLandFilter(landFilter?.key === land.key ? null : land); document.getElementById('rides')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            <span className="vp-land-label"><strong>{land.title}</strong><small>{land.blurb}</small></span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <main>
      <BrandImage src={BRAND.images.hero} className="pub-hero">
        <div className="pub-hero-inner">
          <h1>{BRAND.hero.headline}</h1>
          <p>{BRAND.hero.sub}</p>
          <div className="pub-hero-actions">
            <Link to="/tickets" className="pub-buy pub-buy-lg">Buy Tickets</Link>
            <a href="#rides" className="pub-hero-link">Explore Rides <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </BrandImage>

      <div className="pub-quickbuy-wrap">
        <QuickBuy prices={site?.prices} />
      </div>

      <div className="visitor-content">
        {error && <div className="visitor-alert error" role="alert"><strong>Something needs attention</strong><span>{error}</span></div>}

        {landsEl}

        <section className="vp-promo" id="visit">
          <div className="vp-promo-img" aria-hidden="true" />
          <div className="vp-promo-copy">
            <p className="vp-promo-eyebrow">Tickets &amp; Memberships</p>
            <h2>{passPrice != null ? `Day passes from ${money(passPrice)}` : 'Day passes'}</h2>
            <p>{expressPrice != null ? `Add Express queue access for ${money(expressPrice)} and skip the long queues.` : 'Add Express queue access and skip the long queues.'} Members get admission built in all year.</p>
            <div className="vp-promo-actions">
              <Link to="/tickets" className="vp-buy">Buy Tickets</Link>
              <Link to="/member/register" className="vp-ghost vp-ghost-dark">Become a Member</Link>
            </div>
          </div>
        </section>


        <section className="vp-rides" id="rides">
          <h2>Rides &amp; Entertainment{landFilter ? <> · {landFilter.title} <button type="button" className="vp-clear" onClick={() => setLandFilter(null)}>Clear</button></> : null}</h2>
          <div className="vp-list-bar">
            <label className="vp-search"><span className="sr-only">Search rides or zones</span><input value={rideSearch} onChange={(event) => setRideSearch(event.target.value)} placeholder="Search rides or zones" /></label>
            <strong>{visibleRides.length} things</strong>
          </div>
          <div className="vp-list">
            {visibleRides.map((ride) => (
              <article className={`vp-row ${ride.state === 'Open' ? '' : 'vp-row-closed'}`} key={ride.rideId}>
                <div className="vp-row-img" style={{ backgroundImage: `url(${rideImage(ride.zoneName)})` }} aria-hidden="true" />
                <div className="vp-row-main">
                  <h3>{ride.rideName}</h3>
                  <p>{ride.zoneName}</p>
                  <span className={`ride-status ${statusTone(ride.state)}`}><i />{ride.state}</span>
                </div>
              </article>
            ))}
          </div>
          {!loading && visibleRides.length === 0 && <div className="empty-state ride-empty">No rides match those filters. Try a different search.</div>}
          <p className="ride-disclaimer"><span aria-hidden="true">ⓘ</span> Status comes from the park’s live ride status.</p>
        </section>
      </div>
    </main>
  )
}

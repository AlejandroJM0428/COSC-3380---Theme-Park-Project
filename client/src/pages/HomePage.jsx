import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getVisitorDashboard } from '../api/index.js'
import NotificationBar from '../components/NotificationBar.jsx'
import Wordmark from '../components/Wordmark.jsx'
import { BRAND, LANDS } from '../config/brand.js'
import { money, rideImage, statusTone } from '../utils/portalFormat.js'
import './VisitorPortal.css'

// The public front door (/). No sign-in needed. It never shows wait times or anything personal.
export default function HomePage() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rideSearch, setRideSearch] = useState('')
  const [landFilter, setLandFilter] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDashboard(await getVisitorDashboard())
    } catch (err) {
      setError(err.message || 'Could not load the park information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const passPrice = dashboard?.prices?.dayPass ?? 79
  const expressPrice = dashboard?.prices?.expressAddOn ?? 25
  const rides = dashboard?.rides ?? []
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
    <main className="visitor-portal">
      <header className="vp-header">
        <div className="vp-utility">
          <span>{BRAND.name}</span>
          <span className="vp-utility-links">
            <Link to="/member/login">Sign in</Link>
            <Link to="/member/register">Join</Link>
          </span>
        </div>
        <div className="vp-navbar">
          <Link to="/" className="visitor-brand" aria-label={`${BRAND.name} home`}>
            <Wordmark />
          </Link>
          <nav className="vp-nav" aria-label="Main navigation">
            <a href="#rides">Rides &amp; Entertainment</a>
            <a href="#visit">Tickets &amp; Memberships</a>
          </nav>
          <Link to="/member/login" className="vp-buy">Buy Tickets</Link>
        </div>
      </header>

      <NotificationBar />

      <section className="vp-hero">
        <div className="vp-hero-copy">
          <p className="vp-hero-eyebrow">{`Welcome to ${BRAND.shortName}`}</p>
          <h1>More thrills.<br />Less waiting.</h1>
          <div className="vp-hero-actions">
            <Link to="/member/login" className="vp-buy">Buy Tickets</Link>
            <a href="#rides" className="vp-ghost">Explore Rides</a>
          </div>
        </div>
      </section>

      <div className="visitor-content">
        {error && <div className="visitor-alert error" role="alert"><strong>Something needs attention</strong><span>{error}</span></div>}

        {landsEl}

        <section className="vp-promo" id="visit">
          <div className="vp-promo-img" aria-hidden="true" />
          <div className="vp-promo-copy">
            <p className="vp-promo-eyebrow">Tickets &amp; Memberships</p>
            <h2>Day passes from {money(passPrice)}</h2>
            <p>Add Express queue access for {money(expressPrice)} and skip the long waits. Members get admission built in all year.</p>
            <div className="vp-promo-actions">
              <Link to="/member/login" className="vp-buy">Buy Tickets</Link>
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
              <article className={`vp-row ${ride.currentState === 'Open' ? '' : 'vp-row-closed'}`} key={ride.rideId}>
                <div className="vp-row-img" style={{ backgroundImage: `url(${rideImage(ride.zoneName)})` }} aria-hidden="true" />
                <div className="vp-row-main">
                  <h3>{ride.rideName}</h3>
                  <p>{ride.zoneName}</p>
                  <span className={`ride-status ${statusTone(ride.currentState)}`}><i />{ride.currentState}</span>
                </div>
              </article>
            ))}
          </div>
          {!loading && visibleRides.length === 0 && <div className="empty-state ride-empty">No rides match those filters. Try a different search.</div>}
          <p className="ride-disclaimer"><span aria-hidden="true">ⓘ</span> Status comes from the park’s live ride status.</p>
        </section>
      </div>

      <footer className="vp-footer">
        <div className="vp-footer-inner">
          <div className="vp-footer-brand"><Wordmark tagline={false} light /></div>
          <nav aria-label="Footer">
            <Link to="/member/login">Member sign in</Link>
            <Link to="/member/register">Join</Link>
            <Link to="/staff/login">Staff sign in</Link>
            <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
          </nav>
        </div>
        <p>{BRAND.name} · Visitor portal prototype</p>
      </footer>
    </main>
  )
}

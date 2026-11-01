import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPublicSite } from '../api/index.js'
import BrandImage from '../components/BrandImage.jsx'
import QuickBuy from '../components/QuickBuy.jsx'
import PlanTiles from '../components/home/PlanTiles.jsx'
import RideTeaser from '../components/home/RideTeaser.jsx'
import ThingsToDo from '../components/home/ThingsToDo.jsx'
import TicketsMembershipsPromo from '../components/home/TicketsMembershipsPromo.jsx'
import { BRAND } from '../config/brand.js'

// The public front door (/). No sign-in needed. It never shows wait times or anything personal.
export default function HomePage() {
  const [site, setSite] = useState(null)
  const [error, setError] = useState('')

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    getPublicSite()
      .then((data) => { if (alive) { setSite(data); setError('') } })
      .catch((err) => { if (alive) setError(err.message || 'Could not load the park information.') })
    return () => { alive = false }
  }, [attempt])

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

      {error && (
        <div className="pub-section">
          <div className="pub-alert" role="alert">
            <strong>Something needs attention</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          </div>
        </div>
      )}

      <ThingsToDo venues={site?.venues} />
      <TicketsMembershipsPromo prices={site?.prices} tiers={site?.tiers} />
      <RideTeaser rides={site?.rides} />
      <PlanTiles hours={site?.hours} rides={site?.rides} />
    </main>
  )
}

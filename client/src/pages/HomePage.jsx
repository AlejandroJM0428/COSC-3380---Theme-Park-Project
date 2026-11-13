import BrandImage from '../components/BrandImage.jsx'
import Explorer from '../components/home/Explorer.jsx'
import MembershipPicker from '../components/home/MembershipPicker.jsx'
import PlanPanel from '../components/home/PlanPanel.jsx'
import PriceCheck from '../components/home/PriceCheck.jsx'
import { BRAND } from '../config/brand.js'
import usePublicSite from '../hooks/usePublicSite.js'
import useParkClock from '../hooks/useParkClock.js'
import { clockLabel } from '../utils/parkTime.js'

// The public front door (/). No sign-in needed. It never shows wait times or anything personal.
// Visitors can check a price here; the account step happens at checkout.
export default function HomePage() {
  const { site, error, retry } = usePublicSite()
  const park = useParkClock()

  // Today's facts under the headline. Hours come from the Park row.
  const facts = []
  if (park.reason === 'weather') {
    facts.push({ key: 'hours', off: true, text: 'Closed now · Severe weather' })
  } else if (park.openAt != null) {
    facts.push(park.mode === 'closed'
      ? { key: 'hours', off: true, text: `Closed now · Opens ${park.opensTomorrow ? 'tomorrow' : 'today'} at ${clockLabel(park.openAt)}` }
      : { key: 'hours', text: `Open today ${clockLabel(park.openAt)} – ${clockLabel(park.closeAt)}` })
  }
  if (park.mode === 'happyhour') facts.push({ key: 'happy', text: `Happy Hour until ${clockLabel(BRAND.happyHour.end)}` })

  return (
    <main>
      <BrandImage src={BRAND.images.hero} className="pub-hero">
        <div className="pub-hero-inner">
          <div className="pub-hero-copy">
            <h1>{BRAND.hero.headline}</h1>
            <p>{BRAND.hero.sub}</p>
            {facts.length > 0 && (
              <ul className="pub-hero-facts" aria-label="Today at the park">
                {facts.map((f) => (
                  <li key={f.key} className={f.off ? 'off' : ''}><span className="pub-fact-dot" aria-hidden="true" />{f.text}</li>
                ))}
              </ul>
            )}
            <a href="#explore" className="pub-hero-link">Explore the park <span aria-hidden="true">↓</span></a>
          </div>
          <PriceCheck prices={site?.prices} soldOutDates={site?.soldOutDates} />
        </div>
      </BrandImage>

      {error && (
        <div className="pub-section">
          <div className="pub-alert" role="alert">
            <strong>Something needs attention</strong>
            <span>{error}</span>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        </div>
      )}



      <Explorer rides={site?.rides} venues={site?.venues} />

      <section className="pub-section pub-duo" aria-label="Memberships and planning">
        <MembershipPicker tiers={site?.tiers} />
        <PlanPanel hours={site?.hours} rides={site?.rides} />
      </section>
    </main>
  )
}

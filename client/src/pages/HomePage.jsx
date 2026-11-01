import BrandImage from '../components/BrandImage.jsx'
import Explorer from '../components/home/Explorer.jsx'
import MembershipPicker from '../components/home/MembershipPicker.jsx'
import PlanPanel from '../components/home/PlanPanel.jsx'
import PriceCheck from '../components/home/PriceCheck.jsx'
import { BRAND } from '../config/brand.js'
import usePublicSite from '../hooks/usePublicSite.js'

// The public front door (/). No sign-in needed. It never shows wait times or anything personal.
// Visitors can check a price here; the account step happens at checkout.
export default function HomePage() {
  const { site, error, retry } = usePublicSite()

  return (
    <main>
      <BrandImage src={BRAND.images.hero} className="pub-hero">
        <div className="pub-hero-inner">
          <div className="pub-hero-copy">
            <h1>{BRAND.hero.headline}</h1>
            <p>{BRAND.hero.sub}</p>
            <a href="#explore" className="pub-hero-link">Explore the park <span aria-hidden="true">↓</span></a>
          </div>
          <PriceCheck prices={site?.prices} />
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

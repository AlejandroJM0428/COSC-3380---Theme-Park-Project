import { useState } from 'react'
import { Link } from 'react-router-dom'
import BrandImage from '../BrandImage.jsx'
import { BRAND, LANDS } from '../../config/brand.js'

const MAX_CHIPS = 9

const RIDE_IMAGES = {
  // Thrill Rides
  'Beltway 8 Orbit': '/images/canyon-cyclone.jpg',
  'Allen Parkway Splashdown': '/images/rapids-rampage.jpg',
  'Kirby Drive Launch': '/images/thunder-run.jpg',

  // Family Favorites
  "Gator Alley": '/images/krakens-lair.jpg',
  "Bayou Plunge": '/images/pirates-plunge.jpg',
  'Hurricane Simulator': '/images/tidal-simulator.jpg',
  'Art Car Odyssey': '/images/enchanted-journey.jpg',
  'Katy Flyer': '/images/forest-express.jpg',
  "Fannin Street Funhouse": '/images/wizards-workshop.jpg',
  'Main Street Streetcar': '/images/heritage-railroad.jpg',
  "Chimney Rock": '/images/dragons-nest.jpg',
  'Market Square Carousel': '/images/grand-carousel.jpg',

  // kids corner
  'Zoo Carousel': '/images/mini-carousel.jpg',

    // Dining & Shops
  'Crawfish Shack': '/images/bay-fish-shack.jpg',
  'Richmond Strip BBQ': '/images/canyon-grill.jpg',
  'Montrose Taco Stand': '/images/forest-pizza.jpg',
  'Waugh Drive Diner': '/images/main-street-diner.jpg',
  'Almeda Snowball Cart': '/images/sweet-treats-cart.jpg',
  'Post Oak Outfitters': '/images/canyon-outfitters.jpg',
  'Westheimer Emporium': '/images/main-street-emporium.jpg',
  "Bayou Trading Post": '/images/pirates-trading-post.jpg',
}

const TABS = [
  ...LANDS.map((land) => ({ key: land.key, title: land.title, blurb: land.blurb, img: land.img })),
  { key: 'dining', title: 'Dining & Shops', blurb: 'Food, drinks and gifts', img: BRAND.images.dining },
]

// Turn the public site data into the items of one tab. Rides show Open/Closed only: no wait data exists here.
function itemsFor(tab, rides, venues) {
  if (tab.key === 'dining') {
    return venues.map((v) => ({
      id: `v${v.venueId}`,
      name: v.venueName,
      zone: v.zoneName,
      facts: [v.venueType, v.serviceType].filter(Boolean),
      state: null,
    }))
  }
  const land = LANDS.find((l) => l.key === tab.key)
  return rides
    .filter((r) => land.zones.includes(r.zoneName))
    .map((r) => ({
      id: `r${r.rideId}`,
      name: r.rideName,
      zone: r.zoneName,
      facts: [r.rideType, r.minHeightCm != null ? `Min height ${r.minHeightCm} cm` : 'Any height'].filter(Boolean),
      state: r.state,
      reason: r.closedReason ?? null,
    }))
}

// One interactive panel instead of four sections: pick a land, pick a ride or venue, see its details.
export default function Explorer({ rides = [], venues = [] }) {
  const [tabKey, setTabKey] = useState(TABS[0].key)
  const [pickedId, setPickedId] = useState(null)

  const tab = TABS.find((t) => t.key === tabKey)
  const items = itemsFor(tab, rides, venues)
  const shown = items.slice(0, MAX_CHIPS)
  const more = items.length - shown.length
  const picked = items.find((i) => i.id === pickedId) ?? items[0] ?? null

  function chooseTab(key) {
    setTabKey(key)
    setPickedId(null)
  }

  return (
    <section className="pub-section" id="explore" aria-labelledby="pub-explore-title">
      <h2 id="pub-explore-title" className="pub-h2">What kind of day do you want?</h2>

      <div className="pub-tabs-row" role="group" aria-label="Choose a land">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="pub-pill" aria-pressed={t.key === tabKey} onClick={() => chooseTab(t.key)}>
            {t.title}
          </button>
        ))}
      </div>

      <div className="pub-explore">
        <BrandImage
          key={`${tab.key}-${picked?.id ?? 'none'}`}
          src={RIDE_IMAGES[picked?.name] ?? tab.img}
          className="pub-feature"
        >
          <div className="pub-feature-body">
            <p className="pub-eyebrow">{tab.title}</p>
            {picked ? (
              <>
                <h3>{picked.name}</h3>
                <p className="pub-feature-meta">
                  {picked.zone}
                  {picked.facts.map((f) => <span key={f}>{f}</span>)}
                  {picked.state && <span className={`pub-badge ${picked.state === 'Open' ? 'open' : 'closed'}`}>{picked.state === 'Open' ? 'Open' : picked.reason === 'maintenance' ? 'Closed: maintenance' : picked.reason === 'weather' ? 'Closed: weather' : picked.state}</span>}
                </p>
              </>
            ) : (
              <>
                <h3>{tab.blurb}</h3>
                <p className="pub-feature-meta">Nothing listed here yet.</p>
              </>
            )}
            
              <Link
                
                  to={tab.key === 'dining'
                    ? '/rides#dining-shops'
                    : `/rides?land=${tab.key}#explore-rides`
                  }

                className="pub-feature-link"
              >
                See all in {tab.title}
                <span aria-hidden="true">→</span>
              </Link>

          </div>
        </BrandImage>

        <div className="pub-chips" role="group" aria-label={`${tab.title} choices`}>
          {shown.map((item) => (
            <button key={item.id} type="button" className="pub-chip" aria-pressed={picked?.id === item.id} onClick={() => setPickedId(item.id)}>
              <strong>{item.name}</strong>
              <small>{item.zone}</small>
            </button>
          ))}
          
          {more > 0 && (
            <Link
              
              to={tab.key === 'dining'
                ? '/rides#dining-shops'
                : `/rides?land=${tab.key}#explore-rides`
              }

              className="pub-chip pub-chip-more"
            >
              +{more} more
            </Link>
          )}

        </div>
      </div>
    </section>
  )
}

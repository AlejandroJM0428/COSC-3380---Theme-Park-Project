import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BrandImage from '../components/BrandImage.jsx'
import LoadError from '../components/LoadError.jsx'
import ParkMap from '../components/ParkMap.jsx'
import usePublicSite from '../hooks/usePublicSite.js'
import { BRAND, LANDS, ZONE_MAP } from '../config/brand.js'
import { money, rideImage } from '../utils/portalFormat.js'

const MAX_PREMIER = 4
const MAX_GAMES = 6


const RIDE_CATEGORIES = [
  { key: 'premier', label: 'Premier Rides' },
  { key: 'thrill', label: 'Thrill Rides' },
  { key: 'family', label: 'Family Favorites' },
  { key: 'kids', label: 'Kids Corner' },
]


const RIDE_IMAGES = {
  // Thrill Rides
  'Canyon Cyclone': '/images/canyon-cyclone.jpg',
  'Rapids Rampage': '/images/rapids-rampage.jpg',
  'Thunder Run': '/images/thunder-run.jpg',

  // Family Favorites
  "Kraken's Lair": '/images/krakens-lair.jpg',
  "Pirate's Plunge": '/images/pirates-plunge.jpg',
  'Tidal Simulator': '/images/tidal-simulator.jpg',
  'Enchanted Journey': '/images/enchanted-journey.jpg',
  'Forest Express': '/images/forest-express.jpg',
  "Wizard's Workshop": '/images/wizards-workshop.jpg',
  'Heritage Railroad': '/images/heritage-railroad.jpg',
  "Dragon's Nest": '/images/dragons-nest.jpg',
  'Grand Carousel': '/images/grand-carousel.jpg',

  // Kids Corner
  'Mini Carousel': '/images/mini-carousel.jpg',
}


const GAME_IMAGES = {
  'Dunk Tank': '/images/dunk-tank.jpg',
  'Whack-a-Gator': '/images/whack-a-gator.jpg',
  'Skee Ball': '/images/skee-ball.jpg',
  'Basketball Shot': '/images/basketball-shot.jpg',
  'Ring Toss': '/images/ring-toss.jpg',
  'Balloon Pop': '/images/balloon-pop.jpg',
}


// Public rides page (/rides): premier rides, entertainment, then a park map.
// Deep links still work: ?zone=Thunder Canyon, or ?land=thrill|family|kids (that land's zones). Anything else selects nothing.
// Open/Closed only: no wait times, no member data.
export default function Rides() {
  const { site, loading, error, retry } = usePublicSite()
  const [params] = useSearchParams()
  const [picked, setPicked] = useState(null)
  const [rideCategory, setRideCategory] = useState('premier')

  const fromLink = useMemo(() => {
    const zone = params.get('zone')
    if (zone && ZONE_MAP[zone]) return [zone]
    return LANDS.find((l) => l.key === params.get('land'))?.zones ?? []
  }, [params])
  const selected = picked ?? fromLink

  const rides = useMemo(() => site?.rides ?? [], [site])
  const games = useMemo(() => site?.games ?? [], [site])
  const venues = useMemo(() => site?.venues ?? [], [site])

  const premier = useMemo(
    () => rides.filter((r) => r.expressEligible).sort((a, b) => (b.state === 'Open') - (a.state === 'Open')).slice(0, MAX_PREMIER),
    [rides],
  )

  
const filteredRides = useMemo(() => {
  if (rideCategory === 'premier') {
    return premier
  }

  const selectedLand = LANDS.find(
    (land) => land.key === rideCategory
  )

  if (!selectedLand) return []

  return rides.filter((ride) =>
    selectedLand.zones.includes(ride.zoneName)
  )
}, [rideCategory, rides, premier])


  const counts = useMemo(() => {
    const out = {}
    for (const name of Object.keys(ZONE_MAP)) {
      out[name] = {
        rides: rides.filter((r) => r.zoneName === name).length,
        games: games.filter((g) => g.zoneName === name).length,
        venues: venues.filter((v) => v.zoneName === name).length,
      }
    }
    return out
  }, [rides, games, venues])

  const inZone = (item) => selected.includes(item.zoneName)
  const zoneRides = rides.filter(inZone)
  const zoneGames = games.filter(inZone)
  const zoneVenues = venues.filter(inZone)
  const land = LANDS.find((l) => selected.length > 1 && l.zones.length === selected.length && l.zones.every((z) => selected.includes(z)))
  const title = selected.length === 0 ? 'Pick a zone' : land ? land.title : selected.join(', ')

  function toggleZone(name) {
    setPicked(selected.length === 1 && selected[0] === name ? [] : [name])
  }

  return (
    <main className="pub-page pub-page-wide">
      <h1 className="pub-h1">Rides &amp; entertainment</h1>
      <p className="pub-lede">The headline rides, midway games and a map of everything at {BRAND.name}.</p>

      {error && <LoadError message={error} onRetry={retry} />}
      {loading && <p className="pub-empty">Loading…</p>}

      
      <section aria-labelledby="pub-rides-title">
        <h2 id="pub-rides-title" className="pub-h2">
          Explore Our Rides
        </h2>

        <p className="pub-lede">
          Discover exciting attractions for every kind of adventure.
        </p>

        <div className="pub-ride-filters" aria-label="Ride categories">
          {RIDE_CATEGORIES.map((category) => (
            <button
              key={category.key}
              type="button"
              className={`pub-ride-filter ${
                rideCategory === category.key ? 'active' : ''
              }`}
              aria-pressed={rideCategory === category.key}
              onClick={() => setRideCategory(category.key)}
            >
              {category.label}
            </button>
          ))}
        </div>

        {filteredRides.length > 0 ? (
          <ul className="pub-premier">
            {filteredRides.map((r) => (
              <li key={r.rideId}>
                <BrandImage
                  src={RIDE_IMAGES[r.rideName] ?? rideImage(r.zoneName)}
                  className={`pub-premier-img ${
                    r.state === 'Open' ? '' : 'is-closed'
                  }`}
                >
                  <span
                    className={`pub-badge ${
                      r.state === 'Open' ? 'open' : 'closed'
                    }`}
                  >
                    {r.state}
                  </span>
                </BrandImage>

                <h3>{r.rideName}</h3>

                <p>
                  {r.zoneName} · {r.rideType}
                  {r.minHeightCm ? ` · Min ${r.minHeightCm} cm` : ''}
                </p>

                {r.expressEligible && (
                  <p className="pub-premier-tag">
                    Express queue available
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pub-empty">
            {loading
              ? 'Loading rides...'
              : 'No rides available in this category.'}
          </p>
        )}
      </section>


      
      {games.length > 0 && (
        <section aria-labelledby="pub-ent-title">
          <h2 id="pub-ent-title" className="pub-h2 pub-h2-spaced">
            Entertainment
          </h2>

          <p className="pub-lede">
            Step right up! Discover exciting midway games
            and fun challenges for everyone.
          </p>

          <ul className="pub-games pub-games-enhanced">
            {games.slice(0, MAX_GAMES).map((g) => (
              <li key={g.gameId} className="pub-game-card">
                <div className="pub-game-image">
                  <img
                    src={GAME_IMAGES[g.gameName] || '/images/game-default.jpg'}
                    alt={g.gameName}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>

                <div className="pub-game-content">
                  <h3>{g.gameName}</h3>
                  <p className="pub-game-location">
                    {g.zoneName}
                  </p>

                  <div className="pub-game-bottom">
                    <span className="pub-game-price">
                      {money(g.playPrice)} per play
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {games.length > MAX_GAMES && (
            <p className="pub-note">
              +{games.length - MAX_GAMES} more games around
              the park. Pick a zone on the map to see them.
            </p>
          )}
        </section>
      )}


      <section aria-labelledby="pub-map-title">
        
        <h2 id="pub-map-title" className="pub-h2 pub-h2-spaced">
          Explore Thunder Valley
        </h2>

        <p className="pub-lede">
          Discover our five themed zones! Select an area on the map
          to explore rides, games, dining, and attractions.
        </p>

        <div className="pub-mapwrap">
          <ParkMap counts={counts} selected={selected} onSelect={toggleZone} />

          <aside className="pub-zonepanel" aria-live="polite">
            <h3>{title}</h3>
            {selected.length === 0 ? (
              <p className="pub-note">Choose a zone on the map to see its rides, games, dining and shops.</p>
            ) : (
              <>
                <ZoneList label="Rides" items={zoneRides.map((r) => ({ key: r.rideId, name: r.rideName, note: r.state, closed: r.state !== 'Open' }))} />
                <ZoneList label="Games" items={zoneGames.map((g) => ({ key: g.gameId, name: g.gameName, note: money(g.playPrice) }))} />
                <ZoneList label="Dining & shops" items={zoneVenues.map((v) => ({ key: v.venueId, name: v.venueName, note: v.venueType }))} />
                {zoneRides.length + zoneGames.length + zoneVenues.length === 0 && <p className="pub-note">Nothing listed here yet.</p>}
              </>
            )}
            <p className="pub-note"><Link to="/plan" className="pub-link">Hours, height rules and directions →</Link></p>
          </aside>
        </div>
        <p className="pub-note">Schematic map, not to scale.</p>
      </section>
    </main>
  )
}

function ZoneList({ label, items }) {
  if (items.length === 0) return null
  return (
    <div className="pub-zonelist">
      <h4>{label}</h4>
      <ul>
        {items.map((i) => (
          <li key={i.key} className={i.closed ? 'is-closed' : ''}><span>{i.name}</span><small>{i.note}</small></li>
        ))}
      </ul>
    </div>
  )
}

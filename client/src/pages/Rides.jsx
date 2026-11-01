import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import BrandImage from '../components/BrandImage.jsx'
import LoadError from '../components/LoadError.jsx'
import ParkMap from '../components/ParkMap.jsx'
import usePublicSite from '../hooks/usePublicSite.js'
import { BRAND, ENTERTAINMENT, LANDS, ZONE_MAP } from '../config/brand.js'
import { money, rideImage } from '../utils/portalFormat.js'

const MAX_PREMIER = 4
const MAX_GAMES = 10


// The tab row. 'all' is the default and shows everything. The ride tabs show rides only,
// 'entertainment' shows the theater, and 'food' shows midway games plus dining & shops.
const RIDE_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'premier', label: 'Premier Rides' },
  { key: 'thrill', label: 'Thrill Rides' },
  { key: 'family', label: 'Family Favorites' },
  { key: 'kids', label: 'Kids Rides' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'food', label: 'Food, Drinks & Games' },
]

// Which tab a link opens: ?land=thrill|family|kids picks that land, ?land=dining or #dining-shops opens the food tab,
// #entertainment opens the theater, anything else is All.
function categoryFromUrl(params, hash) {
  const land = params.get('land')
  if (['thrill', 'family', 'kids'].includes(land)) return land
  if (land === 'dining' || hash === '#dining-shops') return 'food'
  if (hash === '#entertainment') return 'entertainment'
  return 'all'
}


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

  // Hermann Park
  'Zoo Carousel': '/images/mini-carousel.jpg',
}


const GAME_IMAGES = {
  'Dunk on Dunlavy': '/images/dunk-tank.jpg',
  'Whack-a-Gator': '/images/whack-a-gator.jpg',
  'Fantasy Grove': '/images/fantasy-grove.jpg',
  'Skee on Shepherd': '/images/skee-ball.jpg',
  'Hoops on Holcombe': '/images/basketball-shot.jpg',
  'Rodeo Ring Toss': '/images/ring-toss.jpg',
  'Pop on Post Oak': '/images/balloon-pop.jpg',
}


const VENUE_IMAGES = {
  'Crawfish Shack': '/images/bay-fish-shack.jpg',
  'Richmond Strip BBQ': '/images/canyon-grill.jpg',
  'Montrose Taco Stand': '/images/forest-pizza.jpg',
  'Waugh Drive Diner': '/images/main-street-diner.jpg',
  'Almeda Snowball Cart': '/images/sweet-treats-cart.jpg',
  'Post Oak Outfitters': '/images/canyon-outfitters.jpg',
  'Westheimer Emporium': '/images/main-street-emporium.jpg',
  "Bayou Trading Post": '/images/pirates-trading-post.jpg',
}


// Public rides page (/rides): premier rides, entertainment, then a park map.
// Deep links still work: ?zone=The Loop, or ?land=thrill|family|kids (that land's zones). Anything else selects nothing.
// Open/Closed only: no wait times, no member data.
export default function Rides() {
  const { site, loading, error, retry } = usePublicSite()
  const [params] = useSearchParams()
  const location = useLocation()
  const [picked, setPicked] = useState(null)
  
  const [rideCategory, setRideCategory] = useState(() => categoryFromUrl(params, location.hash))

  // When the link changes (for example ?land=kids), follow it. Clicking a tab does not touch the URL, so it sticks.
  const urlKey = `${params.get('land') ?? ''}|${location.hash}`
  const [seenUrlKey, setSeenUrlKey] = useState(urlKey)
  if (seenUrlKey !== urlKey) {
    setSeenUrlKey(urlKey)
    setRideCategory(categoryFromUrl(params, location.hash))
  }




useEffect(() => {
  const targetId = location.hash.slice(1)

  if (!['explore-rides', 'dining-shops', 'entertainment'].includes(targetId)) {
    return
  }

  const scrollToSection = () => {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: 'auto',
      block: 'start',
    })
  }

  const frame = requestAnimationFrame(scrollToSection)

  return () => cancelAnimationFrame(frame)
}, [location.hash, location.search, loading])





  const fromLink = useMemo(() => {
    const zone = params.get('zone')
    if (zone && ZONE_MAP[zone]) return [zone]
    return LANDS.find((l) => l.key === params.get('land'))?.zones ?? []
  }, [params])
  const selected = picked ?? fromLink

  const rides = useMemo(() => site?.rides ?? [], [site])
 const games = useMemo(() => {
  const allGames = site?.games ?? []

  const hasFantasyGrove = allGames.some(
    (g) => g.gameName === 'Fantasy Grove'
  )

  if (hasFantasyGrove) return allGames

  return [
    ...allGames,
    {
      gameId: 'fantasy-grove-display',
      gameName: 'Fantasy Grove',
      zoneName: 'Montrose',
      playPrice: 12.00,
    },
  ]
}, [site])

  const venues = useMemo(() => site?.venues ?? [], [site])

  const premier = useMemo(
    () => rides.filter((r) => r.expressEligible).sort((a, b) => (b.state === 'Open') - (a.state === 'Open')).slice(0, MAX_PREMIER),
    [rides],
  )

  
const filteredRides = useMemo(() => {
  if (rideCategory === 'all') {
    return rides
  }

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
  const zoneShows = [ENTERTAINMENT].filter(inZone)
  const land = LANDS.find((l) => selected.length > 1 && l.zones.length === selected.length && l.zones.every((z) => selected.includes(z)))
  const title = selected.length === 0 ? 'Pick a zone' : land ? land.title : selected.join(', ')

  // Rides show on All and the four ride tabs. The theater shows on All and Entertainment.
  // Midway games and dining & shops show on All and Food, Drinks & Games.
  const showRides = rideCategory !== 'food' && rideCategory !== 'entertainment'
  const showEntertainment = rideCategory === 'all' || rideCategory === 'entertainment'
  const showFood = rideCategory === 'all' || rideCategory === 'food'

  function toggleZone(name) {
    setPicked(selected.length === 1 && selected[0] === name ? [] : [name])
  }

  return (
    <main className="pub-page pub-page-wide">
      <h1 className="pub-h1">Rides &amp; entertainment</h1>
      <p className="pub-lede">The headline rides, midway games and a map of everything at {BRAND.name}.</p>

      {error && <LoadError message={error} onRetry={retry} />}
      {loading && <p className="pub-empty">Loading…</p>}

      
      <section id="explore-rides" aria-labelledby="pub-rides-title">
        <h2 id="pub-rides-title" className="pub-h2">
          Explore the Park
        </h2>

        <p className="pub-lede">
          Discover exciting attractions, midway games and good food for every kind of adventure.
        </p>

        <div className="pub-ride-filters" role="group" aria-label="Browse by category">
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

        {!showRides ? null : filteredRides.length > 0 ? (
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


      
      {showEntertainment && (
        <section id="entertainment" aria-labelledby="pub-show-title">
          <h2 id="pub-show-title" className="pub-h2 pub-h2-spaced">
            Entertainment
          </h2>

          <p className="pub-lede">
            Catch a live show at the park&apos;s theater.
          </p>

          <ul className="pub-games pub-games-enhanced">
            <li className="pub-game-card">
              <BrandImage src={ENTERTAINMENT.img} className="pub-game-image" label={ENTERTAINMENT.name} />

              <div className="pub-game-content">
                <h3>{ENTERTAINMENT.name}</h3>
                <p className="pub-game-location">{ENTERTAINMENT.zoneName}</p>
                <p className="pub-note">{ENTERTAINMENT.blurb}</p>
                <div className="pub-game-bottom">
                  <span className="pub-game-price">{ENTERTAINMENT.kind}</span>
                </div>
              </div>
            </li>
          </ul>
        </section>
      )}

      {showFood && games.length > 0 && (
        <section aria-labelledby="pub-games-title">
          <h2 id="pub-games-title" className="pub-h2 pub-h2-spaced">
            Midway Games
          </h2>

          <p className="pub-lede">
            Step right up! Test your aim, win prizes and
            enjoy classic carnival games for everyone.
          </p>

          <ul className="pub-games pub-games-enhanced">
            {[...games]
              .sort((a, b) => {
               if (a.gameName === 'Pop on Post Oak') return -1
               if (b.gameName === 'Pop on Post Oak') return 1
               return 0
             })
             .slice(0, MAX_GAMES)
             .map((g) => (
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

      {showFood && (
        <section id="dining-shops" aria-labelledby="pub-dining-title">
          <h2 id="pub-dining-title" className="pub-h2 pub-h2-spaced">
            Dining &amp; Shops
          </h2>

          <p className="pub-lede">
            Take a break, enjoy delicious food, and discover unique souvenirs.
          </p>

          {venues.length > 0 ? (
            <ul className="pub-games pub-games-enhanced">
              {venues.map((venue) => (
                <li key={venue.venueId} className="pub-game-card">
                  <div className="pub-game-image">
                    <img
                      src={VENUE_IMAGES[venue.venueName] ?? '/images/dining-default.jpg'}
                      alt={venue.venueName}
                      loading="lazy"
                    />
                  </div>

                  <div className="pub-game-content">
                    <h3>{venue.venueName}</h3>
                    <p className="pub-game-location">{venue.zoneName}</p>
                    <div className="pub-game-bottom">
                      <span>{venue.venueType}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pub-empty">No dining or shops listed yet.</p>
          )}
        </section>
      )}


      <section aria-labelledby="pub-map-title">
        
        <h2 id="pub-map-title" className="pub-h2 pub-h2-spaced">
          Explore Beltway Park
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
                <ZoneList label="Entertainment" items={zoneShows.map((s) => ({ key: s.name, name: s.name, note: s.kind }))} />
                <ZoneList label="Games" items={zoneGames.map((g) => ({ key: g.gameId, name: g.gameName, note: money(g.playPrice) }))} />
                <ZoneList label="Dining & shops" items={zoneVenues.map((v) => ({ key: v.venueId, name: v.venueName, note: v.venueType }))} />
                {zoneRides.length + zoneShows.length + zoneGames.length + zoneVenues.length === 0 && <p className="pub-note">Nothing listed here yet.</p>}
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

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

// Public rides page (/rides): premier rides, entertainment, then a park map.
// Deep links still work: ?zone=Thunder Canyon, or ?land=thrill|family|kids (that land's zones). Anything else selects nothing.
// Open/Closed only: no wait times, no member data.
export default function Rides() {
  const { site, loading, error, retry } = usePublicSite()
  const [params] = useSearchParams()
  const [picked, setPicked] = useState(null)

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

      {premier.length > 0 && (
        <section aria-labelledby="pub-premier-title">
          <h2 id="pub-premier-title" className="pub-h2">Premier rides</h2>
          <ul className="pub-premier">
            {premier.map((r) => (
              <li key={r.rideId}>
                <BrandImage src={rideImage(r.zoneName)} className={`pub-premier-img ${r.state === 'Open' ? '' : 'is-closed'}`}>
                  <span className={`pub-badge ${r.state === 'Open' ? 'open' : 'closed'}`}>{r.state}</span>
                </BrandImage>
                <h3>{r.rideName}</h3>
                <p>{r.zoneName} · {r.rideType}{r.minHeightCm ? ` · Min ${r.minHeightCm} cm` : ''}</p>
                <p className="pub-premier-tag">Express queue available</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {games.length > 0 && (
        <section aria-labelledby="pub-ent-title">
          <h2 id="pub-ent-title" className="pub-h2 pub-h2-spaced">Entertainment</h2>
          <ul className="pub-games">
            {games.slice(0, MAX_GAMES).map((g) => (
              <li key={g.gameId}>
                <strong>{g.gameName}</strong>
                <span>{g.zoneName}</span>
                <b>{money(g.playPrice)} per play</b>
              </li>
            ))}
          </ul>
          {games.length > MAX_GAMES && <p className="pub-note">+{games.length - MAX_GAMES} more games around the park. Pick a zone on the map to see them.</p>}
        </section>
      )}

      <section aria-labelledby="pub-map-title">
        <h2 id="pub-map-title" className="pub-h2 pub-h2-spaced">Park map</h2>
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

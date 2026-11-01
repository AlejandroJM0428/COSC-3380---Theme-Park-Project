import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BrandImage from '../components/BrandImage.jsx'
import LoadError from '../components/LoadError.jsx'
import usePublicSite from '../hooks/usePublicSite.js'
import { BRAND, LANDS } from '../config/brand.js'
import { rideImage } from '../utils/portalFormat.js'

const TABS = [{ key: 'all', title: 'All' }, ...LANDS.map((l) => ({ key: l.key, title: l.title })), { key: 'dining', title: 'Dining & Shops' }]

// Public rides page (/rides?land=thrill|family|kids|dining). Open/Closed only: no wait times, no member data.
// An unknown or missing `land` shows everything.
export default function Rides() {
  const { site, loading, error, retry } = usePublicSite()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')

  const requested = params.get('land')
  const land = LANDS.find((l) => l.key === requested)
  const dining = requested === 'dining'
  const activeKey = land ? land.key : dining ? 'dining' : 'all'
  const q = search.trim().toLowerCase()

  const rides = useMemo(() => (site?.rides ?? []).filter((r) => (
    (!land || land.zones.includes(r.zoneName)) && (!q || `${r.rideName} ${r.zoneName} ${r.rideType}`.toLowerCase().includes(q))
  )), [site, land, q])

  const venues = useMemo(() => (site?.venues ?? []).filter((v) => (
    !q || `${v.venueName} ${v.zoneName} ${v.venueType}`.toLowerCase().includes(q)
  )), [site, q])

  const count = dining ? venues.length : rides.length

  return (
    <main className="pub-page pub-page-wide">
      <h1 className="pub-h1">Rides &amp; entertainment</h1>
      <p className="pub-lede">Everything at {BRAND.name}. Status is the park’s live Open or Closed.</p>

      <nav className="pub-tabs" aria-label="Browse by land">
        {TABS.map((tab) => (
          <Link key={tab.key} to={tab.key === 'all' ? '/rides' : `/rides?land=${tab.key}`} className={tab.key === activeKey ? 'active' : ''} aria-current={tab.key === activeKey ? 'page' : undefined}>{tab.title}</Link>
        ))}
      </nav>

      <div className="pub-list-bar">
        <label className="pub-search">
          <span className="sr-only">{dining ? 'Search dining and shops' : 'Search rides or zones'}</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={dining ? 'Search dining and shops' : 'Search rides or zones'} />
        </label>
        <strong aria-live="polite">{loading ? 'Loading…' : `${count} ${dining ? (count === 1 ? 'place' : 'places') : (count === 1 ? 'ride' : 'rides')}`}</strong>
      </div>

      {error && <LoadError message={error} onRetry={retry} />}

      {dining ? (
        <ul className="pub-rows">
          {venues.map((v) => (
            <li key={v.venueId} className="pub-row">
              <BrandImage src={BRAND.images.dining} className="pub-row-img" />
              <div className="pub-row-main">
                <h2>{v.venueName}</h2>
                <p>{v.zoneName} · {v.venueType}{v.serviceType ? ` · ${v.serviceType}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="pub-rows">
          {rides.map((r) => (
            <li key={r.rideId} className={`pub-row ${r.state === 'Open' ? '' : 'pub-row-closed'}`}>
              <BrandImage src={rideImage(r.zoneName)} className="pub-row-img" />
              <div className="pub-row-main">
                <h2>{r.rideName}</h2>
                <p>{r.zoneName} · {r.rideType}{r.minHeightCm ? ` · Min ${r.minHeightCm} cm` : ''}</p>
              </div>
              <span className={`pub-badge ${r.state === 'Open' ? 'open' : 'closed'}`}>{r.state}</span>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && count === 0 && <p className="pub-empty">Nothing matches that search. Try a different word or land.</p>}
    </main>
  )
}

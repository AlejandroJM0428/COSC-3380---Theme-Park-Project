import { Link } from 'react-router-dom'
import BrandImage from '../BrandImage.jsx'
import { rideImage } from '../../utils/portalFormat.js'

const MAX = 6

// Pick up to MAX open rides, taking one per zone in turn so the row is not all one land.
// Only name and zone are shown. No status, no wait data.
function pickTeaser(rides) {
  const byZone = new Map()
  for (const ride of rides) {
    if (ride.state !== 'Open') continue
    if (!byZone.has(ride.zoneName)) byZone.set(ride.zoneName, [])
    byZone.get(ride.zoneName).push(ride)
  }
  const queues = [...byZone.values()]
  const picked = []
  while (picked.length < MAX && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (q.length && picked.length < MAX) picked.push(q.shift())
    }
  }
  return picked
}

export default function RideTeaser({ rides = [] }) {
  const picks = pickTeaser(rides)
  if (picks.length === 0) return null

  return (
    <section className="pub-section" id="rides" aria-labelledby="pub-rides-title">
      <div className="pub-section-head">
        <h2 id="pub-rides-title" className="pub-h2">Featured rides</h2>
        <Link to="/rides" className="pub-link">See all rides →</Link>
      </div>
      <ul className="pub-teaser">
        {picks.map((ride) => (
          <li key={ride.rideId}>
            <BrandImage src={rideImage(ride.zoneName)} className="pub-teaser-img" />
            <h3>{ride.rideName}</h3>
            <p>{ride.zoneName}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { BRAND } from '../../config/brand.js'

// "07:30" or "22:00" -> "7:30 AM" / "10:00 PM"
function clock(value) {
  const [h, m] = String(value ?? '').split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// Plan your visit: hours and height rules come from the public site data; directions are placeholder copy.
// `bare` renders just the tiles (for the /plan page, which has its own heading).
export default function PlanTiles({ hours, rides = [], bare = false }) {
  const heights = rides.map((r) => r.minHeightCm).filter((cm) => cm != null)
  const shortest = heights.length ? Math.min(...heights) : null
  const tallest = heights.length ? Math.max(...heights) : null

  const tiles = (
    <div className="pub-plan">
        <article>
          <h3>Hours</h3>
          <p>{hours?.open && hours?.close ? `Open daily, ${clock(hours.open)} to ${clock(hours.close)}.` : 'Opening hours will be posted here.'}</p>
        </article>
        <article>
          <h3>Height requirements</h3>
          <p>
            {shortest != null
              ? `Some rides have a minimum height, from ${shortest} cm up to ${tallest} cm. Each ride lists its own rule.`
              : 'Each ride lists its own height rule.'}
          </p>
        </article>
        <article>
          <h3>Getting here</h3>
          <p>{BRAND.plan.directions}</p>
        </article>
    </div>
  )

  if (bare) return tiles
  return (
    <section className="pub-section" id="plan" aria-labelledby="pub-plan-title">
      <h2 id="pub-plan-title" className="pub-h2">Plan your visit</h2>
      {tiles}
    </section>
  )
}

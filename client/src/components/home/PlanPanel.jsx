import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../../config/brand.js'
import { clock } from '../../utils/portalFormat.js'

// "Plan your day" as three toggles that swap one answer, instead of three stacked tiles.
// Hours and height rules come from the public site data; directions are placeholder copy.
export default function PlanPanel({ hours, rides = [] }) {
  const [key, setKey] = useState('hours')

  const heights = rides.map((r) => r.minHeightCm).filter((cm) => cm != null)
  const shortest = heights.length ? Math.min(...heights) : null
  const tallest = heights.length ? Math.max(...heights) : null

  const answers = {
    hours: hours?.open && hours?.close ? `Open daily, ${clock(hours.open)} to ${clock(hours.close)}.` : 'Opening hours will be posted here.',
    height: shortest != null
      ? `Some rides have a minimum height, from ${shortest} cm up to ${tallest} cm. Each ride lists its own rule.`
      : 'Each ride lists its own height rule.',
    directions: BRAND.plan.directions,
  }
  const labels = { hours: 'Hours', height: 'Height rules', directions: 'Getting here' }

  return (
    <article className="pub-panel" aria-labelledby="pub-plan-title">
      <p className="pub-eyebrow">Plan your day</p>
      <h2 id="pub-plan-title" className="pub-panel-title">Good to know</h2>

      <div className="pub-segment" role="group" aria-label="Choose a topic">
        {Object.keys(labels).map((k) => (
          <button key={k} type="button" aria-pressed={k === key} onClick={() => setKey(k)}>{labels[k]}</button>
        ))}
      </div>

      <p className="pub-panel-answer" aria-live="polite">{answers[key]}</p>
      <div className="pub-panel-actions">
        <Link to="/plan" className="pub-link">Everything for your visit →</Link>
      </div>
    </article>
  )
}

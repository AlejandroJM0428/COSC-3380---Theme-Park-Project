import { BRAND } from '../config/brand.js'
import HelmetMark from './HelmetMark.jsx'

// Helmet mark plus the park name. To change the logo, change HelmetMark or this one component.
// `light` is for dark backgrounds. `est` shows "Est. <year>" under the name (instead of the tagline).
// `mark={false}` gives the name alone.
export default function Wordmark({ tagline = true, light = false, est = false, mark = true, markSize = 36 }) {
  const sub = est && BRAND.established ? `Est. ${BRAND.established}` : tagline ? BRAND.tagline : ''
  return (
    <span className={`wordmark${light ? ' wordmark-light' : ''}`}>
      {mark ? <HelmetMark size={markSize} onDark={light} /> : null}
      <span className="wordmark-text">
        <strong>{BRAND.shortName ?? BRAND.name}</strong>
        {sub ? <small>{sub}</small> : null}
      </span>
    </span>
  )
}

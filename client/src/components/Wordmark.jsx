import { BRAND } from '../config/brand.js'

// Text-only wordmark. To use a logo later, change this one component.
// `est` shows "Est. <year>" under the name (instead of the tagline).
export default function Wordmark({ tagline = true, light = false, est = false }) {
  const sub = est && BRAND.established ? `Est. ${BRAND.established}` : tagline ? BRAND.tagline : ''
  return (
    <span className={`wordmark${light ? ' wordmark-light' : ''}`}>
      <strong>{BRAND.shortName ?? BRAND.name}</strong>
      {sub ? <small>{sub}</small> : null}
    </span>
  )
}

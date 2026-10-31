import { BRAND } from '../config/brand.js'

// Text-only wordmark. To use a logo later, change this one component.
export default function Wordmark({ tagline = true, light = false }) {
  return (
    <span className={`wordmark${light ? ' wordmark-light' : ''}`}>
      <strong>{BRAND.name}</strong>
      {tagline && BRAND.tagline ? <small>{BRAND.tagline}</small> : null}
    </span>
  )
}

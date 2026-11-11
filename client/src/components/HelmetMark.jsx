// The park's mark: an astronaut helmet. Colors come from tokens.css (see .helmet in shared.css).
// onDark: use on a navy or dark background (the outline turns blue).
export default function HelmetMark({ size = 36, onDark = false, title }) {
  return (
    <svg
      className={`helmet${onDark ? ' on-dark' : ''}`}
      width={size}
      height={size}
      viewBox="3 2 50 50"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <rect className="helmet-accent" x="14" y="44" width="28" height="8" rx="3" />
      <circle className="helmet-shell" cx="28" cy="26" r="21" />
      <rect className="helmet-visor" x="12" y="16" width="32" height="22" rx="11" />
      <path className="helmet-shine" d="M18 25 Q20 19 27 19" />
    </svg>
  )
}

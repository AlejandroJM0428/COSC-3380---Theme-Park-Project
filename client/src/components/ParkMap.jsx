import { ZONE_MAP } from '../config/brand.js'

// Schematic park map (not to scale), drawn like Houston's road pattern:
// Beltway 8 is the ring road (the Main Street Streetcar circles the park along it), the 610 Interchange is the hub
// where the paths cross, Main Street runs from the entrance up to the hub, and a lake sits between the top two lands.
// Each zone is a button: click or press Enter/Space to select it.
// `counts` is { [zoneName]: { rides, games, venues } }. `selected` is a list of zone names (empty = none).
export default function ParkMap({ counts = {}, selected = [], onSelect }) {
  const anySelected = selected.length > 0
  const zones = Object.entries(ZONE_MAP)

  return (
    <svg
      className="pub-map"
      viewBox="0 0 900 548"
      role="group"
      aria-label="Park map. Beltway 8 rings the park and the 610 Interchange is at the center. Choose a zone to see what is there."
    >
      <rect x="0" y="0" width="900" height="548" rx="24" className="pub-map-bg" />

      <g aria-hidden="true">
        {/* the lake between The Loop and Buffalo Bayou */}
        <ellipse cx="450" cy="122" rx="92" ry="54" className="pub-map-lake" />
        <text x="450" y="127" textAnchor="middle" className="pub-map-label pub-map-label-lake">LAKE</text>

        {/* Beltway 8: the outer ring road, with the streetcar line along it */}
        <rect x="18" y="18" width="864" height="482" rx="44" className="pub-map-ring" />
        <rect x="18" y="18" width="864" height="482" rx="44" className="pub-map-ringline" />
        <rect x="388" y="11" width="124" height="14" rx="7" className="pub-map-ringtag" />
        <text x="450" y="22" textAnchor="middle" className="pub-map-label pub-map-label-ring">BELTWAY 8</text>

        {/* paths: west and east roads meet the 610 Interchange; Main Street runs from the entrance to the hub */}
        <g className="pub-map-paths">
          <path d="M190 230 L190 270" />
          <path d="M710 230 L710 270" />
          <path d="M190 250 L426 250" />
          <path d="M710 250 L474 250" />
          <path d="M450 274 L450 290" />
          <path d="M300 360 L330 360" />
          <path d="M570 360 L600 360" />
          <path d="M450 450 L450 516" />
        </g>

        {/* the 610 Interchange hub */}
        <circle cx="450" cy="250" r="25" className="pub-map-hub" />
        <text x="450" y="256" textAnchor="middle" className="pub-map-hubtext">610</text>
        <text x="450" y="214" textAnchor="middle" className="pub-map-label">INTERCHANGE</text>

        {/* legend and entrance */}
        <g className="pub-map-legend">
          <line x1="40" y1="478" x2="66" y2="478" className="pub-map-legendline" />
          <text x="76" y="483" className="pub-map-legendtext">Main Street Streetcar circles the park on Beltway 8</text>
        </g>
        <text x="450" y="538" textAnchor="middle" className="pub-map-entrance">ENTRANCE</text>
      </g>

      {zones.map(([name, z]) => {
        const c = counts[name] ?? { rides: 0, games: 0, venues: 0 }
        const on = selected.includes(name)
        const parts = [c.rides && `${c.rides} ${c.rides === 1 ? 'ride' : 'rides'}`, c.games && `${c.games} ${c.games === 1 ? 'game' : 'games'}`, c.venues && `${c.venues} dining & shops`].filter(Boolean)
        return (
          <g
            key={name}
            className={`pub-zone ${on ? 'on' : ''} ${anySelected && !on ? 'dim' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${name}${parts.length ? `: ${parts.join(', ')}` : ''}`}
            onClick={() => onSelect?.(name)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(name) } }}
          >
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="22" style={{ fill: z.fill }} />
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 6} textAnchor="middle" className="pub-zone-name">{name}</text>
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 22} textAnchor="middle" className="pub-zone-count">{parts[0] ?? ''}</text>
          </g>
        )
      })}
    </svg>
  )
}

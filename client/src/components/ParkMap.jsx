import { ZONE_MAP } from '../config/brand.js'

// Schematic park map. Each zone is a button: click or press Enter/Space to select it.
// `counts` is { [zoneName]: { rides, games, venues } }. `selected` is a list of zone names (empty = none).
export default function ParkMap({ counts = {}, selected = [], onSelect }) {
  const anySelected = selected.length > 0
  const zones = Object.entries(ZONE_MAP)

  return (
    <svg className="pub-map" viewBox="0 0 900 520" role="group" aria-label="Park map. Choose a zone to see what is there.">
      <rect x="0" y="0" width="900" height="520" rx="24" className="pub-map-bg" />
      {/* paths into Main Street */}
      <g className="pub-map-paths" aria-hidden="true">
        <path d="M190 230 L190 250 L450 250 L450 290" />
        <path d="M710 230 L710 250 L450 250" />
        <path d="M300 360 L330 360" />
        <path d="M570 360 L600 360" />
        <path d="M450 450 L450 490" />
      </g>
      <text x="450" y="508" textAnchor="middle" className="pub-map-entrance">ENTRANCE</text>

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
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="22" fill={z.fill} />
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 6} textAnchor="middle" className="pub-zone-name">{name}</text>
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 22} textAnchor="middle" className="pub-zone-count">{parts[0] ?? ''}</text>
          </g>
        )
      })}
    </svg>
  )
}

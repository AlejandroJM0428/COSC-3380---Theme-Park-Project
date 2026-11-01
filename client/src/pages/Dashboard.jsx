
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { NAV_SECTIONS, ROLE_INFO } from '../config/nav.js'

// Used by both portals: the staff portal (default) and the admin portal (base="/admin" + its own sections).
// `children` shows between the welcome text and the menu cards (the admin portal puts its summary there).
export default function Dashboard({ base = '/staff', sections: menu = NAV_SECTIONS, children }) {
  const { user } = useAuth()
  const info = ROLE_INFO[user.role] ?? { title: 'Dashboard', blurb: '' }

  const sections = menu
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => i.roles.includes(user.role)),
    }))
    .filter((s) => s.items.length > 0)

  const featured = user.role === 'Cashier'
    ? sections.flatMap((s) => s.items).find((i) => i.to === '/tickets')
    : null

  return (
    <div className="thunder-home">
      <div className="thunder-intro" id="park-dashboard">
        <span className="thunder-section-label">Welcome back, {user.username}</span>
        <h2>{info.title}</h2>
        <p>{info.blurb}</p>
      </div>

      {children}

      {featured && (
        <Link to={`${base}${featured.to}`} className="thunder-featured">
          <span className="thunder-featured-icon">🎟️</span>
          <div>
            <h3>Sell a Ticket</h3>
            <p>Start a new ticket sale</p>
          </div>
          <span className="thunder-arrow">→</span>
        </Link>
      )}

      {sections.map((section, index) => {
        const items = section.items.filter((i) => i !== featured)
        if (items.length === 0) return null

        return (
          <section
            key={section.title}
            className="thunder-section"
            style={{ '--section-accent': section.zone }}
          >
            <div className="thunder-section-heading">
              <span className="thunder-section-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h2>{section.title}</h2>
                <p>{items.length} {items.length === 1 ? 'page' : 'pages'} for your role</p>
              </div>
            </div>

            <div className="thunder-card-grid">
              {items.map((item, itemIndex) => (
                <Link
                  key={item.to}
                  to={`${base}${item.to}`}
                  className="thunder-card"
                >
                  <div className="thunder-card-icon">
                    {['🎢', '🎡', '🎟️', '🎠', '🌈', '⚡', '🎪', '🎯'][
                      itemIndex % 8
                    ]}
                  </div>
                  <h3>{item.label}</h3>
                  {item.required && (
                    <span className="thunder-required">Required</span>
                  )}
                  {item.note && <p>{item.note}</p>}
                  <span className="thunder-card-link">
                    Explore <span>→</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

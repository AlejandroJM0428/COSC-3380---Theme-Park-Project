
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { NAV_SECTIONS, ROLE_INFO } from '../config/nav.js'

export default function Dashboard() {
  const { user } = useAuth()
  const info = ROLE_INFO[user.role] ?? { title: 'Dashboard', blurb: '' }

  const sections = NAV_SECTIONS
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

      {featured && (
        <Link to={`/staff${featured.to}`} className="thunder-featured">
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
                <p>Discover everything in {section.title.toLowerCase()}</p>
              </div>
            </div>

            <div className="thunder-card-grid">
              {items.map((item, itemIndex) => (
                <Link
                  key={item.to}
                  to={`/staff${item.to}`}
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

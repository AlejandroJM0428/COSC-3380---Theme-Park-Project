import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { NAV_SECTIONS, ROLE_INFO } from '../config/nav.js'

// Same menu data as the sidebar, shown as tiles. The cashier gets one big "Sell a ticket" button first.
export default function Dashboard() {
  const { user } = useAuth()
  const info = ROLE_INFO[user.role] ?? { title: 'Dashboard', blurb: '' }
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(user.role)) })).filter(
    (s) => s.items.length > 0,
  )
  const featured = user.role === 'Cashier' ? sections.flatMap((s) => s.items).find((i) => i.to === '/tickets') : null

  return (
    <div>
      <h1>{info.title}</h1>
      <p className="muted">
        {info.blurb} Signed in as {user.username}.
      </p>

      {featured && (
        <Link to={featured.to} className="featured">
          <strong>Sell a ticket</strong>
          <span>Start a new sale</span>
        </Link>
      )}

      {sections.map((section) => {
        const items = section.items.filter((i) => i !== featured)
        if (items.length === 0) return null
        return (
          <section key={section.title} className="tile-section" style={{ '--zone': section.zone }}>
            <h2>{section.title}</h2>
            <div className="tile-grid">
              {items.map((item) => (
                <Link key={item.to} to={item.to} className="tile">
                  <h3>
                    {item.label} {item.required && <span className="tag">Required</span>}
                  </h3>
                  {item.note && <p>{item.note}</p>}
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

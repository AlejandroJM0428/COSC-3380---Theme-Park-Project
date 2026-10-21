import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { REPORTS } from '../config/reports.js'

export default function Dashboard() {
  const { user } = useAuth()
  const seesReports = user.role !== 'Cashier'

  return (
    <div>
      <h1>Welcome, {user.username}</h1>
      {seesReports ? (
        <div className="card-grid">
          {REPORTS.map((r) => (
            <Link key={r.key} to={`/reports/${r.key}`} className="card report-card">
              <h3>
                {r.title} {r.required && <span className="tag">Required</span>}
              </h3>
              <p className="muted">{r.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p>Use the menu on the left to sell tickets and record purchases.</p>
      )}
    </div>
  )
}

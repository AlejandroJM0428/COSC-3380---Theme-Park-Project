import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import NotificationBar from './NotificationBar.jsx'
import Wordmark from './Wordmark.jsx'
import { BRAND } from '../config/brand.js'
import '../portal.css'

// Compact app-style shell shared by the member portal (/member) and, later, the guest portal (/guest).
//   title:    the current page name, shown in the bar
//   tabs:     [{ key, label }]. The guest portal passes a list without Membership.
//   active:   the key of the current tab
//   onSelect: called with a tab key when a tab is chosen
export default function PortalLayout({ title, tabs = [], active, onSelect, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="pt">
      <div className="awning-wrap is-blue" aria-hidden="true">
        <div className="awning" />
      </div>
      <header className="pt-bar">
        <div className="pt-bar-inner">
          <Link to="/" className="pt-brand" aria-label={`${BRAND.name} home`}><Wordmark tagline={false} /></Link>
          <span className="pt-title">{title}</span>
          <details className="pt-account">
            <summary>{user?.name || 'Account'}</summary>
            <div className="pt-menu">
              <Link to="/">Park website</Link>
              <button type="button" onClick={() => { logout(); navigate('/') }}>Sign out</button>
            </div>
          </details>
        </div>
        {tabs.length > 0 && (
          <nav className="pt-tabs" aria-label="Portal sections">
            {tabs.map((tab) => (
              <button type="button" key={tab.key} className={tab.key === active ? 'active' : ''} aria-current={tab.key === active ? 'page' : undefined} onClick={() => onSelect?.(tab.key)}>{tab.label}</button>
            ))}
          </nav>
        )}
      </header>

      <NotificationBar />

      <main className="pt-main">{children}</main>
    </div>
  )
}

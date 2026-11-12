import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { FORM_PAGES } from '../config/nav.js'
import { EDIT_ROLES, PAGE_WRITE_ROLES, REPORT_ADD_ENTITIES, REPORT_EDIT_PAGES } from '../config/reportEdits.js'

// "Edit the records behind this report": links from a report to the record pages where its data is added or changed.
// Admin and the manager roles only, and only the pages that role can write to.
export default function ReportEditLinks({ reportKey, onAdd }) {
  const { user } = useAuth()
  const role = user?.role
  if (!EDIT_ROLES.includes(role)) return null
  const base = role === 'Admin' ? '/admin' : '/staff' // the portal each role works in (App.jsx)

  const pages = (REPORT_EDIT_PAGES[reportKey] ?? [])
    .map((path) => FORM_PAGES.find((f) => f.path === path && f.ready))
    .filter((page) => page && page.roles.includes(role) && (PAGE_WRITE_ROLES[page.path] ?? page.roles).includes(role))
  // "Add record": only what this person may write. Tickets are sold on their own page, so that entry is a link.
  const canWrite = (page) => page && page.roles.includes(role) && (PAGE_WRITE_ROLES[page.path] ?? page.roles).includes(role)
  const addable = pages
    .filter((page) => REPORT_ADD_ENTITIES[page.path] && (REPORT_ADD_ENTITIES[page.path].writeRoles ?? [role]).includes(role))
    .map((page) => REPORT_ADD_ENTITIES[page.path])
  const sellPage = (REPORT_EDIT_PAGES[reportKey] ?? []).includes('refunds') ? FORM_PAGES.find((f) => f.path === 'tickets' && f.ready) : null
  const sell = onAdd && canWrite(sellPage) ? sellPage : null
  if (pages.length === 0) return null
  const closeMenu = (ev) => {
    const menu = ev.currentTarget.closest('details')
    if (menu) menu.open = false
  }

  return (
    <nav className="rp-editlinks" aria-label="Edit the records behind this report">
      <span className="rp-editlinks-label">Edit the records behind this report:</span>
      {pages.map((page) => (
        <Link key={page.path} to={`${base}/${page.path}`} className="rp-editlinks-link">
          {page.label}
        </Link>
      ))}
      {onAdd && (addable.length > 0 || sell) && (
        <details className="rp-addmenu">
          <summary className="rp-editlinks-link">Add record</summary>
          <ul>
            {sell && (
              <li>
                <Link to={`${base}/${sell.path}`}>Sell ticket</Link>
              </li>
            )}
            {addable.map((entity) => (
              <li key={entity.resource}>
                <button
                  type="button"
                  onClick={(ev) => {
                    closeMenu(ev)
                    onAdd(entity)
                  }}
                >
                  Add {entity.noun}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </nav>
  )
}

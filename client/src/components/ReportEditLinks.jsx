import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { FORM_PAGES } from '../config/nav.js'
import { EDIT_ROLES, PAGE_WRITE_ROLES, REPORT_EDIT_PAGES } from '../config/reportEdits.js'

// "Edit the records behind this report": links from a report to the record pages where its data is added or changed.
// Admin and the manager roles only, and only the pages that role can write to.
export default function ReportEditLinks({ reportKey }) {
  const { user } = useAuth()
  const role = user?.role
  if (!EDIT_ROLES.includes(role)) return null
  const base = role === 'Admin' ? '/admin' : '/staff' // the portal each role works in (App.jsx)

  const pages = (REPORT_EDIT_PAGES[reportKey] ?? [])
    .map((path) => FORM_PAGES.find((f) => f.path === path && f.ready))
    .filter((page) => page && page.roles.includes(role) && (PAGE_WRITE_ROLES[page.path] ?? page.roles).includes(role))
  if (pages.length === 0) return null

  return (
    <nav className="rp-editlinks" aria-label="Edit the records behind this report">
      <span className="rp-editlinks-label">Edit the records behind this report:</span>
      {pages.map((page) => (
        <Link key={page.path} to={`${base}/${page.path}`} className="rp-editlinks-link">
          {page.label}
        </Link>
      ))}
    </nav>
  )
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'

// Wrap routes with this. No `roles` = any logged-in user; with `roles` = only those roles.
// `loginPath` is where to send people who are not signed in (staff and members have separate logins).
// `redirects` sends a role to its own portal instead, e.g. { Admin: '/admin' } so an admin never lands in /staff.
// `denyTo` sends a signed-in user whose role is not allowed to another page instead of showing a message.
export default function RequireAuth({ roles, loginPath = '/staff/login', redirects, denyTo }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to={loginPath} replace state={{ from: location }} />
  if (redirects?.[user.role]) return <Navigate to={redirects[user.role]} replace />
  if (roles && !roles.includes(user.role)) {
    if (denyTo) return <Navigate to={denyTo} replace />
    return <p className="page-note">Your role ({user.role}) cannot open this page.</p>
  }
  return <Outlet />
}

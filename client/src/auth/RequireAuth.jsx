import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'

// Wrap routes with this. No `roles` = any logged-in user; with `roles` = only those roles.
// `loginPath` is where to send people who are not signed in (staff and members have separate logins).
export default function RequireAuth({ roles, loginPath = '/staff/login' }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to={loginPath} replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) {
    return <p className="page-note">Your role ({user.role}) cannot open this page.</p>
  }
  return <Outlet />
}

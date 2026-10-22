import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'

// Wrap routes with this. No `roles` = any logged-in user; with `roles` = only those roles.
export default function RequireAuth({ roles }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) {
    return <p className="page-note">Your role ({user.role}) cannot open this page.</p>
  }
  return <Outlet />
}

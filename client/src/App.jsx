import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AdminOnePage from './pages/AdminOnePage.jsx'
import ReportPage from './pages/ReportPage.jsx'
import QueryPage from './pages/QueryPage.jsx'
import TriggerDemo from './pages/TriggerDemo.jsx'
import SellTicket from './pages/SellTicket.jsx'
import MaintenancePage from './pages/MaintenancePage.jsx'
import TicketSalesPage from './pages/TicketSalesPage.jsx'
import ShiftRatingsPage from './pages/ShiftRatingsPage.jsx'
import MyWork from './pages/MyWork.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import { CustomersPage, FacilitiesPage, GamePlaysPage, MembershipsPage, PurchasesPage, RideLogPage, UsersPage, WeatherPage } from './pages/DataEntryPages.jsx'
import Placeholder from './pages/Placeholder.jsx'
import NotFound from './pages/NotFound.jsx'
import VisitorPortal from './pages/VisitorPortal.jsx'
import { ADMIN_NAV_SECTIONS, ADMIN_ONLY, FORM_PAGES, MANAGEMENT, STAFF_ROLES } from './config/nav.js'

// When you build a real page, import it here and add ONE line to this map
// (key = the `path` in config/nav.js). Until then the Placeholder is shown.
const PAGE_COMPONENTS = {
  tickets: SellTicket,
  refunds: TicketSalesPage,
  maintenance: MaintenancePage,
  employees: ShiftRatingsPage,
  notifications: NotificationsPage,
  'my-work': MyWork,
  customers: CustomersPage,
  memberships: MembershipsPage,
  purchases: PurchasesPage,
  'game-plays': GamePlaysPage,
  'ride-log': RideLogPage,
  weather: WeatherPage,
  facilities: FacilitiesPage,
  users: UsersPage,
}

export default function App() {
  return (
    <Routes>
      {/* 1. Public visitor page: the front door, no login needed */}
      <Route path="/" element={<VisitorPortal mode="public" />} />

      {/* 2. Member (customer) login + account */}
      <Route path="/member/login" element={<Login audience="member" />} />
      <Route path="/member/register" element={<Register />} />
      <Route element={<RequireAuth roles={['Customer']} loginPath="/member/login" />}>
        <Route path="/member" element={<VisitorPortal mode="member" />} />
      </Route>

      {/* 3. Staff sign in (admins sign in here too and are sent to /admin) */}
      <Route path="/staff/login" element={<Login audience="staff" />} />
      <Route path="/login" element={<Navigate to="/staff/login" replace />} />
      <Route path="/visitor" element={<Navigate to="/" replace />} />

      <Route path="*" element={<NotFound />} />

      {/* Admin portal: Admin only. Everyone else who is signed in goes back to /staff. */}
      <Route path="/admin" element={<RequireAuth roles={ADMIN_ONLY} denyTo="/staff" />}>
        {/* The one-page admin: no sidebar. Everything an admin does is a section on this page. */}
        <Route index element={<AdminOnePage />} />
        {/* The older admin pages keep working at their own addresses (with the sidebar). */}
        <Route element={<Layout base="/admin" sections={ADMIN_NAV_SECTIONS} brandSub="Admin portal" />}>
          <Route path="reports/:key" element={<ReportPage />} />
          {/* Not in any menu. Kept for the presentation: type the address to open them. */}
          <Route path="queries" element={<QueryPage />} />
          <Route path="trigger-demos" element={<TriggerDemo />} />

          {FORM_PAGES.map((p) => {
            const Page = PAGE_COMPONENTS[p.path]
            return <Route key={p.path} path={p.path} element={Page ? <Page /> : <Placeholder title={p.label} />} />
          })}

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      {/* Staff portal: every other employee role. An admin who opens /staff is sent to /admin. */}
      <Route path="/staff" element={<RequireAuth roles={STAFF_ROLES} redirects={{ Admin: '/admin' }} />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />

          <Route element={<RequireAuth roles={MANAGEMENT} />}>
            <Route path="reports/:key" element={<ReportPage />} />
          </Route>

          {FORM_PAGES.map((p) => {
            const Page = PAGE_COMPONENTS[p.path]
            return (
              <Route key={p.path} element={<RequireAuth roles={p.roles} />}>
                <Route path={p.path} element={Page ? <Page /> : <Placeholder title={p.label} />} />
              </Route>
            )
          })}

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
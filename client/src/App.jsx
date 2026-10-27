import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ReportPage from './pages/ReportPage.jsx'
import QueryPage from './pages/QueryPage.jsx'
import TriggerDemo from './pages/TriggerDemo.jsx'
import SellTicket from './pages/SellTicket.jsx'
import MaintenancePage from './pages/MaintenancePage.jsx'
import TicketSalesPage from './pages/TicketSalesPage.jsx'
import ShiftRatingsPage from './pages/ShiftRatingsPage.jsx'
import MyWork from './pages/MyWork.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import { CustomersPage, GamePlaysPage, MembershipsPage, PurchasesPage, RideLogPage, WeatherPage } from './pages/DataEntryPages.jsx'
import Placeholder from './pages/Placeholder.jsx'
import NotFound from './pages/NotFound.jsx'
import VisitorPortal from './pages/VisitorPortal.jsx'
import { FORM_PAGES, MANAGEMENT, STAFF_ROLES } from './config/nav.js'

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

      {/* 3. Staff transaction portal */}
      <Route path="/staff/login" element={<Login audience="staff" />} />
      <Route path="/login" element={<Navigate to="/staff/login" replace />} />
      <Route path="/visitor" element={<Navigate to="/" replace />} />

      <Route path="*" element={<NotFound />} />

      <Route path="/staff" element={<RequireAuth roles={STAFF_ROLES} />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />

          <Route element={<RequireAuth roles={MANAGEMENT} />}>
            <Route path="reports/:key" element={<ReportPage />} />
            <Route path="queries" element={<QueryPage />} />
            <Route path="trigger-demos" element={<TriggerDemo />} />
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
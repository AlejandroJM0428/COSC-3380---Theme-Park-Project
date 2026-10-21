import { Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ReportPage from './pages/ReportPage.jsx'
import Placeholder from './pages/Placeholder.jsx'
import NotFound from './pages/NotFound.jsx'
import { FORM_PAGES, MANAGEMENT } from './config/nav.js'

// When you build a real page, import it here and add ONE line to this map
// (key = the `path` in config/nav.js). Until then the Placeholder is shown.
//   import TicketsPage from './pages/TicketsPage.jsx'
//   const PAGE_COMPONENTS = { tickets: TicketsPage }
const PAGE_COMPONENTS = {}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* everything below requires a logged-in user */}
      <Route element={<RequireAuth />}>
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

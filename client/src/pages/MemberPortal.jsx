import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { buyVisitorTicket, getVisitorDashboard, refundVisitorTicket } from '../api/index.js'
import PortalLayout from '../components/PortalLayout.jsx'
import MembershipTab from '../components/portal/MembershipTab.jsx'
import OverviewTab from '../components/portal/OverviewTab.jsx'
import RidesTab from '../components/portal/RidesTab.jsx'
import TicketsTab from '../components/portal/TicketsTab.jsx'
import { formatDate, localDate, money } from '../utils/portalFormat.js'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'membership', label: 'Membership' },
  { key: 'rides', label: 'Rides' },
]

// The signed-in customer portal (/member). Public visitors use HomePage instead.
// The open tab is kept in ?tab= so a refresh stays on the same tab.
export default function MemberPortal() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [visitDate, setVisitDate] = useState(() => {
    const wanted = params.get('date')
    return /^\d{4}-\d{2}-\d{2}$/.test(wanted ?? '') && wanted >= localDate(0) ? wanted : localDate(6)
  })
  const [hasExpress, setHasExpress] = useState(() => params.get('express') === '1')
  const [purchasing, setPurchasing] = useState(false)
  const [refundBusy, setRefundBusy] = useState(null)

  const requested = params.get('tab')
  const tab = TABS.some((t) => t.key === requested) ? requested : 'overview'
  const go = (key) => setParams(key === 'overview' ? {} : { tab: key })

  // logout/navigate change identity every render; keep them in a ref so the loaders stay stable.
  const exitRef = useRef(null)
  useEffect(() => { exitRef.current = () => { logout(); navigate('/member/login', { replace: true }) } })

  // The browser remembers who signed in, but the server forgets sessions when it restarts.
  // No customer back means the server does not see us as signed in, so ask for a fresh sign-in.
  const fetchDashboard = useCallback(async () => {
    const data = await getVisitorDashboard()
    if (!data.customer) { exitRef.current(); return null }
    return data
  }, [])

  useEffect(() => {
    let alive = true
    fetchDashboard()
      .then((data) => { if (alive && data) setDashboard(data) })
      .catch((err) => { if (alive) setError(err.message || 'Could not load the visitor portal.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [fetchDashboard])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDashboard()
      if (data) setDashboard(data)
    } catch (err) {
      setError(err.message || 'Could not load the visitor portal.')
    } finally {
      setLoading(false)
    }
  }, [fetchDashboard])

  const membership = dashboard?.membership
  const isPremier = membership?.tier === 'Premier'
  const passPrice = dashboard?.prices?.dayPass ?? 79
  const expressPrice = dashboard?.prices?.expressAddOn ?? 25
  const totalPrice = (membership ? 0 : passPrice) + (hasExpress && !isPremier ? expressPrice : 0)
  const rides = dashboard?.rides ?? []

  const tickets = dashboard?.tickets ?? []
  const today = localDate(0)
  const upcoming = tickets.filter((t) => t.status !== 'Refunded' && t.visitDate >= today).sort((a, b) => a.visitDate.localeCompare(b.visitDate))
  const past = tickets.filter((t) => t.status === 'Refunded' || t.visitDate < today)

  async function handlePurchase(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setPurchasing(true)
    try {
      const ticket = await buyVisitorTicket({ visitDate, hasExpress: hasExpress || isPremier })
      setSuccess(`Ticket #${ticket.ticketId} is confirmed for ${formatDate(ticket.visitDate)} (${money(ticket.ticketPrice)}).`)
      setHasExpress(false)
      await refresh()
    } catch (err) {
      setError(err.message || 'Ticket purchase failed.')
    } finally {
      setPurchasing(false)
    }
  }

  async function handleRefund(ticket) {
    const approved = window.confirm(`Refund ticket #${ticket.ticketId} for ${formatDate(ticket.visitDate)}? No real money is moved in this prototype.`)
    if (!approved) return
    setError('')
    setSuccess('')
    setRefundBusy(ticket.ticketId)
    try {
      const result = await refundVisitorTicket(ticket.ticketId)
      setSuccess(`Ticket #${result.ticketId} has been refunded.`)
      await refresh()
    } catch (err) {
      setError(err.message || 'Refund failed.')
    } finally {
      setRefundBusy(null)
    }
  }

  const form = { visitDate, setVisitDate, hasExpress, setHasExpress, isPremier, membership, passPrice, expressPrice, totalPrice, purchasing, onSubmit: handlePurchase }
  const title = TABS.find((t) => t.key === tab).label

  return (
    <PortalLayout title={title} tabs={TABS} active={tab} onSelect={go}>
      <div className="pt-pagehead">
        <h1>{title}</h1>
        <button type="button" className="pt-link" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>

      {error && <div className="pt-alert pt-alert-error" role="alert"><strong>Something needs attention</strong><span>{error}</span></div>}
      {success && <div className="pt-alert pt-alert-ok" role="status"><strong>All set</strong><span>{success}</span><button type="button" aria-label="Dismiss message" onClick={() => setSuccess('')}>×</button></div>}

      {tab === 'overview' && <OverviewTab customer={dashboard?.customer} membership={membership} upcoming={upcoming} rides={rides} onGo={go} />}
      {tab === 'tickets' && <TicketsTab form={form} upcoming={upcoming} past={past} loading={loading} refundBusy={refundBusy} onRefund={handleRefund} />}
      {tab === 'membership' && <MembershipTab membership={membership} />}
      {tab === 'rides' && <RidesTab rides={rides} waitsVisible={Boolean(dashboard?.waitsVisible)} loading={loading} />}
    </PortalLayout>
  )
}

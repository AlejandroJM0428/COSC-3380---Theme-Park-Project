import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { buyVisitorMembership, buyVisitorTicket, getVisitorDashboard, refundVisitorTicket } from '../api/index.js'
import PortalLayout from '../components/PortalLayout.jsx'
import TriggerNotice from '../components/TriggerNotice.jsx'
import FamilyTab from '../components/portal/FamilyTab.jsx'
import MembershipTab from '../components/portal/MembershipTab.jsx'
import OverviewTab from '../components/portal/OverviewTab.jsx'
import RidesTab from '../components/portal/RidesTab.jsx'
import TicketsTab from '../components/portal/TicketsTab.jsx'
import { formatDate, localDate, money } from '../utils/portalFormat.js'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'family', label: 'My Family' },
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
  const [buyingMembership, setBuyingMembership] = useState(false)
  const [refundBusy, setRefundBusy] = useState(null)
  // A database trigger stopped something ("blocked") or ran for it ("fired"). See components/TriggerNotice.jsx.
  const [notice, setNotice] = useState(null)
  // State updates are not instant, so a fast double click can start two purchases. These flags change at once.
  const ticketLock = useRef(false)
  const membershipLock = useRef(false)

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
  const passPrice = dashboard?.prices?.dayPass ?? 59
  const expressPrice = dashboard?.prices?.expressAddOn ?? 25
  const totalPrice = (membership ? 0 : passPrice) + (hasExpress && !isPremier ? expressPrice : 0)
  const rides = dashboard?.rides ?? []
  const tiers = dashboard?.tiers ?? []
  const perks = dashboard?.perks ?? []

  const tickets = dashboard?.tickets ?? []
  const today = localDate(0)
  const upcoming = tickets.filter((t) => t.status !== 'Refunded' && t.visitDate >= today).sort((a, b) => a.visitDate.localeCompare(b.visitDate))
  const past = tickets.filter((t) => t.status === 'Refunded' || t.visitDate < today)

  // A failure from a known trigger becomes a "trigger fired" card; anything else stays a plain error.
  function showFailure(err, fallback) {
    if (err.trigger) setNotice({ variant: 'blocked', message: err.message, trigger: err.trigger })
    else setError(err.message || fallback)
  }

  function clearMessages() {
    setError('')
    setSuccess('')
    setNotice(null)
  }

  async function handlePurchase(event) {
    event.preventDefault()
    if (ticketLock.current) return
    ticketLock.current = true
    clearMessages()
    setPurchasing(true)
    try {
      const ticket = await buyVisitorTicket({ visitDate, hasExpress: hasExpress || isPremier })
      const text = `Ticket #${ticket.ticketId} is confirmed for ${formatDate(ticket.visitDate)} (${money(ticket.ticketPrice)}).`
      if (ticket.firedTriggers?.length > 0) setNotice({ variant: 'fired', title: 'Ticket confirmed', message: text, fired: ticket.firedTriggers })
      else setSuccess(text)
      setHasExpress(false)
      await refresh()
    } catch (err) {
      showFailure(err, 'Ticket purchase failed.')
    } finally {
      setPurchasing(false)
      ticketLock.current = false
    }
  }

  async function handleBuyMembership({ tier, autoRenew }) {
    if (membershipLock.current) return
    membershipLock.current = true
    clearMessages()
    setBuyingMembership(true)
    try {
      const result = await buyVisitorMembership({ tier, autoRenew })
      setNotice({
        variant: 'fired',
        title: `Welcome to the ${result.membership.tier} club`,
        message: `Your membership is active through ${formatDate(result.membership.endDate)}.`,
        fired: result.firedTriggers,
      })
      await refresh()
      go('membership')
    } catch (err) {
      showFailure(err, 'Membership purchase failed.')
    } finally {
      setBuyingMembership(false)
      membershipLock.current = false
    }
  }

  async function handleRefund(ticket) {
    const approved = window.confirm(`Refund ticket #${ticket.ticketId} for ${formatDate(ticket.visitDate)}? No real money is moved in this prototype.`)
    if (!approved) return
    clearMessages()
    setRefundBusy(ticket.ticketId)
    try {
      const result = await refundVisitorTicket(ticket.ticketId)
      setSuccess(`Ticket #${result.ticketId} has been refunded.`)
      await refresh()
    } catch (err) {
      showFailure(err, 'Refund failed.')
    } finally {
      setRefundBusy(null)
    }
  }

  // What the Family tab and the cancel card use to show results in the page's own banners.
  const messages = { clear: clearMessages, fail: showFailure, ok: setSuccess, notice: setNotice }

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

      <TriggerNotice notice={notice} onDismiss={() => setNotice(null)} onGo={go} />

      {tab === 'overview' && <OverviewTab customer={dashboard?.customer} membership={membership} tiers={tiers} upcoming={upcoming} rides={rides} onGo={go} onBuyMembership={handleBuyMembership} buyingMembership={buyingMembership} />}
      {tab === 'tickets' && <TicketsTab form={form} upcoming={upcoming} past={past} loading={loading} refundBusy={refundBusy} onRefund={handleRefund} />}
      {tab === 'family' && <FamilyTab messages={messages} />}
      {tab === 'membership' && <MembershipTab membership={membership} perks={perks} tiers={tiers} tickets={tickets} dayPassPrice={passPrice} onBuy={handleBuyMembership} buying={buyingMembership} messages={messages} />}
      {tab === 'rides' && <RidesTab rides={rides} waitsVisible={Boolean(dashboard?.waitsVisible)} loading={loading} />}
    </PortalLayout>
  )
}

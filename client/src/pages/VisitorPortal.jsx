import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { buyVisitorTicket, getVisitorDashboard, refundVisitorTicket } from '../api/index.js'
import './VisitorPortal.css'

function localDate(offset = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0)
}

function statusTone(status) {
  if (status === 'Open') return 'open'
  if (status === 'Closed - Retired') return 'retired'
  return 'closed'
}

// mode="public": anyone can browse (ride board, prices, sign-in links).
// mode="member": signed-in customers also get their membership, tickets and booking.
export default function VisitorPortal({ mode = 'public' }) {
  const isMember = mode === 'member'
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [visitDate, setVisitDate] = useState(() => localDate(6))
  const [hasExpress, setHasExpress] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [refundBusy, setRefundBusy] = useState(null)
  const [rideFilter, setRideFilter] = useState('All rides')
  const [rideSearch, setRideSearch] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDashboard(await getVisitorDashboard())
    } catch (err) {
      setError(err.message || 'Could not load the visitor portal.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const membership = dashboard?.membership
  const isPremier = membership?.tier === 'Premier'
  const passPrice = dashboard?.prices?.dayPass ?? 79
  const expressPrice = dashboard?.prices?.expressAddOn ?? 25
  const totalPrice = (membership ? 0 : passPrice) + (hasExpress && !isPremier ? expressPrice : 0)
  const rides = dashboard?.rides ?? []
  const openCount = rides.filter((ride) => ride.currentState === 'Open').length
  const closedCount = rides.length - openCount
  const visibleRides = useMemo(() => rides.filter((ride) => {
    const matchesFilter = rideFilter === 'All rides'
      || (rideFilter === 'Open now' && ride.currentState === 'Open')
      || (rideFilter === 'Closed' && ride.currentState !== 'Open')
    const q = rideSearch.trim().toLowerCase()
    return matchesFilter && (!q || `${ride.rideName} ${ride.zoneName}`.toLowerCase().includes(q))
  }), [rides, rideFilter, rideSearch])

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
      document.getElementById('my-tickets')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  const tickets = dashboard?.tickets ?? []
  const upcomingTickets = tickets.filter((ticket) => ticket.status !== 'Refunded' && ticket.visitDate >= localDate(0))
  const pastTickets = tickets.filter((ticket) => ticket.status === 'Refunded' || ticket.visitDate < localDate(0))

  return (
    <main className="visitor-portal">
      <header className="visitor-header">
        <Link to="/" className="visitor-brand" aria-label="Thunder Valley home">
          <span className="brand-mark" aria-hidden="true">TV</span>
          <span><strong>Thunder Valley</strong><small>Adventure Park</small></span>
        </Link>
        <nav className="visitor-nav" aria-label="Visitor portal navigation">
          {isMember && <a href="#my-membership">Membership</a>}
          {isMember && <a href="#my-tickets">My tickets</a>}
          <a href="#rides">Rides & waits</a>
          {!isMember && <a href="#visit">Plan a visit</a>}
        </nav>
        {isMember ? (
          <span className="visitor-auth">
            <span className="demo-pill"><span /> {user?.username}</span>
            <button type="button" className="text-button" onClick={() => { logout(); navigate('/') }}>Sign out</button>
          </span>
        ) : (
          <span className="visitor-auth">
            <Link to="/member/login" className="text-button">Member sign in</Link>
            <Link to="/member/register" className="text-button">Join</Link>
            <Link to="/staff/login" className="text-button">Staff portal</Link>
          </span>
        )}
      </header>

      <section className="visitor-hero">
        <div className="hero-copy">
          <p className="eyebrow">{isMember ? 'YOUR PARK DAY, SORTED' : 'WELCOME TO THUNDER VALLEY'}</p>
          <h1>More thrills.<br /><em>Less waiting.</em></h1>
          <p className="hero-summary">{isMember ? 'Your membership, tickets, ride status, and estimated queues—all in one place.' : 'Check which rides are open, see estimated queues, and plan your day at Thunder Valley.'}</p>
          <a href="#rides" className="hero-link">Explore today’s ride board <span aria-hidden="true">↓</span></a>
        </div>
        {isMember ? (
        <div className="hero-ticket" aria-label="Visitor profile preview">
          <div className="hero-ticket-top">
            <span className="ticket-overline">VISITOR PASS</span>
            <span className="ticket-spark" aria-hidden="true">✳</span>
          </div>
          <div className="hero-avatar" aria-hidden="true">{dashboard?.customer ? `${dashboard.customer.firstName[0] ?? ''}${dashboard.customer.lastName[0] ?? ''}`.toUpperCase() : '…'}</div>
          <p className="hero-welcome">WELCOME BACK</p>
          <h2>{loading ? 'Loading your pass…' : dashboard?.customer ? `${dashboard.customer.firstName} ${dashboard.customer.lastName}` : 'Visitor'}</h2>
          <div className="hero-ticket-rule" />
          <div className="hero-ticket-bottom"><span>MEMBER TIER</span><strong>{membership?.tier ?? '—'}</strong></div>
        </div>
        ) : (
        <div className="hero-ticket" aria-label="Member sign in">
          <div className="hero-ticket-top"><span className="ticket-overline">MEMBERS</span><span className="ticket-spark" aria-hidden="true">✳</span></div>
          <h2>Already a member?</h2>
          <p className="hero-welcome">Sign in to see your membership and manage tickets.</p>
          <div className="hero-ticket-rule" />
          <Link to="/member/login" className="visitor-primary-button">Member sign in <span aria-hidden="true">→</span></Link>
          <p className="hero-ticket-secondary">New here? <Link to="/member/register">Create a member account</Link></p>
        </div>
        )}
        <div className="hero-decoration hero-decoration-one" aria-hidden="true" />
        <div className="hero-decoration hero-decoration-two" aria-hidden="true" />
      </section>

      <div className="visitor-content">
        <div className="visitor-page-intro">
          <div><p className="eyebrow">THE IMPORTANT DETAILS</p><h2>{isMember ? 'Your park at a glance' : 'The park at a glance'}</h2></div>
          <button className="text-button" type="button" onClick={refresh} disabled={loading}>↻ Refresh</button>
        </div>

        {error && <div className="visitor-alert error" role="alert"><strong>Something needs attention</strong><span>{error}</span></div>}
        {success && <div className="visitor-alert success" role="status"><strong>All set</strong><span>{success}</span><button type="button" aria-label="Dismiss message" onClick={() => setSuccess('')}>×</button></div>}

        {isMember ? (
        <>
        <section className="overview-grid" aria-label="Park summary">
          <article className="overview-card membership-overview" id="my-membership">
            <div className="overview-card-top"><span className="mini-icon gold-icon" aria-hidden="true">✦</span><span className="subtle-label">YOUR MEMBERSHIP</span><span className="tier-chip">{membership?.tier ?? '—'} TIER</span></div>
            <h3>{membership?.tier ?? 'Membership'} Member</h3>
            <p className="overview-description">{membership?.tier === 'Premier' ? 'The full-throttle park experience.' : membership?.tier === 'Basic' ? 'Your weekday escape starts here.' : 'More flexibility for your next adventure.'}</p>
            <div className="overview-divider" />
            <div className="detail-line"><span>Valid through</span><strong>{formatDate(membership?.endDate)}</strong></div>
            <div className="detail-line"><span>Annual membership</span><strong>{money(membership?.annualPrice)}</strong></div>
            <div className="benefit-row">{membership?.benefits?.slice(0, 2).map((benefit) => <span key={benefit}>✓ {benefit}</span>)}</div>
          </article>

          <article className="overview-card">
            <div className="overview-card-top"><span className="mini-icon blue-icon" aria-hidden="true">▣</span><span className="subtle-label">YOUR TICKETS</span></div>
            <div className="metric-value">{upcomingTickets.length.toString().padStart(2, '0')}</div>
            <h3>Upcoming visits</h3>
            <p className="overview-description">{upcomingTickets.length ? `Your next visit is ${formatDate([...upcomingTickets].sort((a, b) => a.visitDate.localeCompare(b.visitDate))[0].visitDate)}.` : 'No upcoming visits booked yet.'}</p>
            <a className="card-link" href="#my-tickets">Manage tickets <span aria-hidden="true">↗</span></a>
          </article>

          <article className="overview-card">
            <div className="overview-card-top"><span className="mini-icon green-icon" aria-hidden="true">✓</span><span className="subtle-label">RIDE STATUS</span></div>
            <div className="metric-value">{openCount.toString().padStart(2, '0')}<small> / {rides.length.toString().padStart(2, '0')}</small></div>
            <h3>Rides open</h3>
            <p className="overview-description">{closedCount} currently listed as closed or out of service.</p>
            <a className="card-link" href="#rides">View ride board <span aria-hidden="true">↗</span></a>
          </article>
        </section>

        <section className="visitor-section ticket-section" id="my-tickets">
          <div className="section-heading">
            <div><p className="eyebrow">PLAN YOUR VISIT</p><h2>Tickets & refunds</h2><p>Book a visit or manage an existing ticket.</p></div>
            <span className="section-step">01 / VISIT PLANNING</span>
          </div>
          <div className="ticket-workspace">
            <form className="purchase-card" onSubmit={handlePurchase}>
              <div className="purchase-head"><span className="purchase-icon" aria-hidden="true">✦</span><div><h3>Get a park ticket</h3><p>Choose your visit date and queue option.</p></div></div>
              <label className="visitor-label" htmlFor="visit-date">Visit date</label>
              <input id="visit-date" className="visitor-input" type="date" value={visitDate} min={localDate(0)} onChange={(event) => setVisitDate(event.target.value)} required />
              <div className="ticket-price-line"><span>{membership ? `${membership.tier} member admission` : 'Day pass'}</span><strong>{money(membership ? 0 : passPrice)}</strong></div>
              <label className={`express-option ${isPremier ? 'included' : ''}`} htmlFor="express-option">
                <input id="express-option" type="checkbox" checked={isPremier || hasExpress} disabled={isPremier} onChange={(event) => setHasExpress(event.target.checked)} />
                <span className="express-copy"><strong>Express queue access</strong><small>{isPremier ? 'Included with your Premier tier' : 'Add Express access to this ticket'}</small></span>
                <strong>{isPremier ? 'Included' : `+${money(expressPrice)}`}</strong>
              </label>
              <div className="purchase-total"><span>Due today</span><strong>{money(totalPrice)}</strong></div>
              <p className="fine-print">No payment is taken in this prototype. Tickets are saved to the park database.</p>
              <button className="visitor-primary-button" type="submit" disabled={purchasing || loading}>{purchasing ? 'Booking ticket…' : 'Confirm ticket'} <span aria-hidden="true">→</span></button>
            </form>

            <div className="ticket-list-card">
              <div className="ticket-list-head"><div><h3>Upcoming tickets</h3><p>Refunds are available for future visits.</p></div><span className="ticket-count">{upcomingTickets.length}</span></div>
              {loading ? <p className="empty-state">Loading your tickets…</p> : upcomingTickets.length === 0 ? <div className="empty-state"><span aria-hidden="true">▧</span><strong>No upcoming tickets</strong><p>Pick a date to start planning your visit.</p></div> : (
                <div className="customer-ticket-list">
                  {[...upcomingTickets].sort((a, b) => a.visitDate.localeCompare(b.visitDate)).map((ticket) => (
                    <article className="customer-ticket" key={ticket.ticketId}>
                      <div className="ticket-date-block"><span>{new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(`${ticket.visitDate}T12:00:00`)).toUpperCase()}</span><strong>{new Date(`${ticket.visitDate}T12:00:00`).getDate()}</strong><small>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${ticket.visitDate}T12:00:00`))}</small></div>
                      <div className="customer-ticket-main"><div className="ticket-title-line"><strong>Park admission</strong><span className={`ticket-status ${ticket.status.toLowerCase()}`}>{ticket.status}</span></div><span>Ticket #{ticket.ticketId} · {ticket.hasExpress ? 'Express access' : 'Standard queues'}</span><strong>{money(ticket.ticketPrice)}</strong></div>
                      <button className="refund-button" type="button" onClick={() => handleRefund(ticket)} disabled={refundBusy === ticket.ticketId || ticket.visitDate <= localDate(0)} title={ticket.visitDate <= localDate(0) ? 'Refunds are only available before the visit date.' : 'Refund this ticket'}>{refundBusy === ticket.ticketId ? 'Refunding…' : ticket.visitDate <= localDate(0) ? 'Visit day' : 'Refund'}</button>
                    </article>
                  ))}
                </div>
              )}
              {pastTickets.length > 0 && <details className="ticket-history"><summary>Past & refunded tickets ({pastTickets.length})</summary><div className="history-list">{pastTickets.map((ticket) => <div className="history-row" key={ticket.ticketId}><span>#{ticket.ticketId} · {formatDate(ticket.visitDate)}</span><span>{ticket.status}</span><strong>{money(ticket.ticketPrice)}</strong></div>)}</div></details>}
            </div>
          </div>
        </section>

        </>
        ) : (
        <section className="visitor-section" id="visit">
          <div className="section-heading">
            <div><p className="eyebrow">PLAN YOUR VISIT</p><h2>Tickets &amp; memberships</h2><p>Day passes are {money(passPrice)}; Express queue access is +{money(expressPrice)}. Members get their admission built in.</p></div>
          </div>
          <p><Link to="/member/login" className="visitor-primary-button">Sign in to book or manage tickets <span aria-hidden="true">→</span></Link></p>
        </section>

        )}

        <section className="visitor-section rides-section" id="rides">
          <div className="section-heading rides-heading">
            <div><p className="eyebrow">BEFORE YOU JOIN THE LINE</p><h2>Ride board</h2><p>Check availability and estimated queue times before crossing the park.</p></div>
            <span className="section-step">02 / RIDE BOARD</span>
          </div>
          <div className="ride-toolbar">
            <div className="ride-filters" role="group" aria-label="Filter rides">
              {['All rides', 'Open now', 'Closed'].map((filter) => <button type="button" key={filter} className={rideFilter === filter ? 'active' : ''} onClick={() => setRideFilter(filter)}>{filter}</button>)}
            </div>
            <label className="ride-search"><span className="sr-only">Search rides or zones</span><span aria-hidden="true">⌕</span><input value={rideSearch} onChange={(event) => setRideSearch(event.target.value)} placeholder="Search rides or zones" /></label>
          </div>
          <div className="ride-grid">
            {visibleRides.map((ride, index) => (
              <article className={`ride-card ${ride.currentState === 'Open' ? '' : 'ride-card-closed'}`} key={ride.rideId}>
                <div className="ride-card-top"><span className="ride-number">{String(index + 1).padStart(2, '0')}</span><span className={`ride-status ${statusTone(ride.currentState)}`}><i />{ride.currentState}</span></div>
                <h3>{ride.rideName}</h3><p className="ride-zone">{ride.zoneName}</p>
                <div className="ride-card-bottom"><div><span className="queue-caption">EST. WAIT</span><strong className="wait-time">{ride.currentState === 'Open' ? <>{ride.waitMinutes} <small>min</small></> : '—'}</strong></div><span className="ride-feed-label">{ride.currentState === 'Open' ? 'Queue estimate' : 'Not accepting riders'}</span></div>
              </article>
            ))}
          </div>
          {!loading && visibleRides.length === 0 && <div className="empty-state ride-empty">No rides match those filters. Try a different search.</div>}
          <p className="ride-disclaimer"><span aria-hidden="true">ⓘ</span> Open or closed status comes from the park’s live ride status. Wait times are the most recent posted queue reading, not a guarantee.</p>
        </section>

        <footer className="visitor-footer"><Link to="/staff/login">Staff sign in</Link><span>Thunder Valley Adventure Park · Visitor portal prototype</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a></footer>
      </div>
    </main>
  )
}

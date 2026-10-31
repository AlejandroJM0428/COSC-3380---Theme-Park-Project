import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { buyVisitorTicket, getVisitorDashboard, refundVisitorTicket } from '../api/index.js'
import PortalLayout from '../components/PortalLayout.jsx'
import { LANDS } from '../config/brand.js'
import { formatDate, localDate, money, rideImage, statusTone } from '../utils/portalFormat.js'
import './VisitorPortal.css'

// The signed-in customer portal (/member). Public visitors use HomePage instead.
export default function MemberPortal() {
  const { logout } = useAuth()
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
  const [landFilter, setLandFilter] = useState(null)

  // logout/navigate change identity every render; keep them in a ref so refresh stays stable.
  const exitRef = useRef(null)
  useEffect(() => { exitRef.current = () => { logout(); navigate('/member/login', { replace: true }) } })

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getVisitorDashboard()
      // The browser remembers who signed in, but the server forgets sessions when it restarts.
      // No customer back means the server does not see us as signed in, so ask for a fresh sign-in.
      if (!data.customer) {
        exitRef.current()
        return
      }
      setDashboard(data)
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
    const matchesLand = !landFilter || landFilter.zones.includes(ride.zoneName)
    return matchesFilter && matchesLand && (!q || `${ride.rideName} ${ride.zoneName}`.toLowerCase().includes(q))
  }), [rides, rideFilter, rideSearch, landFilter])

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

  const landsEl = (
    <section className="vp-lands" aria-label="Choose your adventure">
      <h2>Choose Your Adventure</h2>
      <div className="vp-land-grid">
        {LANDS.map((land) => (
          <button type="button" key={land.key} className={`vp-land ${landFilter?.key === land.key ? 'active' : ''}`} style={{ backgroundImage: `url(${land.img})` }}
            onClick={() => { setLandFilter(landFilter?.key === land.key ? null : land); setRideFilter('All rides'); document.getElementById('rides')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            <span className="vp-land-label"><strong>{land.title}</strong><small>{land.blurb}</small></span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <PortalLayout
      links={[
        { href: '#my-membership', label: 'Membership' },
        { href: '#my-tickets', label: 'My tickets' },
        { href: '#rides', label: 'Rides & Entertainment' },
      ]}
      cta={{ href: '#my-tickets', label: 'Buy Tickets' }}
    >
      <section className="vp-hero">
        <div className="vp-hero-copy">
          <p className="vp-hero-eyebrow">{`Welcome back${dashboard?.customer ? `, ${dashboard.customer.firstName}` : ''}`}</p>
          <h1>More thrills.<br />Less waiting.</h1>
          <div className="vp-hero-actions">
            <a href="#my-tickets" className="vp-buy">Buy Tickets</a>
            <a href="#rides" className="vp-ghost">Explore Rides</a>
          </div>
        </div>
      </section>

      <div className="visitor-content">
        <div className="visitor-page-intro">
          <div><p className="eyebrow">THE IMPORTANT DETAILS</p><h2>Your park at a glance</h2></div>
          <button className="text-button" type="button" onClick={refresh} disabled={loading}>↻ Refresh</button>
        </div>

        {error && <div className="visitor-alert error" role="alert"><strong>Something needs attention</strong><span>{error}</span></div>}
        {success && <div className="visitor-alert success" role="status"><strong>All set</strong><span>{success}</span><button type="button" aria-label="Dismiss message" onClick={() => setSuccess('')}>×</button></div>}

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

        {landsEl}

        <section className="vp-rides" id="rides">
          <h2>Rides &amp; Entertainment{landFilter ? <> · {landFilter.title} <button type="button" className="vp-clear" onClick={() => setLandFilter(null)}>Clear</button></> : null}</h2>
          <div className="vp-tiles" role="group" aria-label="Filter rides">
            {[['All rides', rides.length], ['Open now', openCount], ['Closed', closedCount]].map(([filter, count]) => (
              <button type="button" key={filter} className={`vp-tile ${rideFilter === filter ? 'active' : ''}`} onClick={() => setRideFilter(filter)}>
                <strong>{count}</strong><span>{filter}</span>
              </button>
            ))}
          </div>
          <div className="vp-list-bar">
            <label className="vp-search"><span className="sr-only">Search rides or zones</span><input value={rideSearch} onChange={(event) => setRideSearch(event.target.value)} placeholder="Search rides or zones" /></label>
            <strong>{visibleRides.length} things</strong>
          </div>
          <div className="vp-list">
            {visibleRides.map((ride) => (
              <article className={`vp-row ${ride.currentState === 'Open' ? '' : 'vp-row-closed'}`} key={ride.rideId}>
                <div className="vp-row-img" style={{ backgroundImage: `url(${rideImage(ride.zoneName)})` }} aria-hidden="true" />
                <div className="vp-row-main">
                  <h3>{ride.rideName}</h3>
                  <p>{ride.zoneName}</p>
                  <span className={`ride-status ${statusTone(ride.currentState)}`}><i />{ride.currentState}</span>
                </div>
                {dashboard?.waitsVisible ? (
                  <div className="vp-row-wait">
                    {ride.currentState === 'Open' && ride.waitMinutes != null ? <><strong>{ride.waitMinutes}</strong><small>min wait</small></> : <small>Not available</small>}
                  </div>
                ) : (
                  <div className="vp-row-wait vp-row-wait-locked"><small>Members see live wait times</small></div>
                )}
              </article>
            ))}
          </div>
          {!loading && visibleRides.length === 0 && <div className="empty-state ride-empty">No rides match those filters. Try a different search.</div>}
          <p className="ride-disclaimer"><span aria-hidden="true">ⓘ</span> Status comes from the park’s live ride status.{dashboard?.waitsVisible ? ' Wait times are the latest posted reading, not a guarantee.' : ''}</p>
        </section>
      </div>
    </PortalLayout>
  )
}

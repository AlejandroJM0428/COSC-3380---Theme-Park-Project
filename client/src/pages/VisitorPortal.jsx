import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { buyVisitorTicket,getVisitorDashboard, refundVisitorTicket, renewVisitorMembership, updateVisitorProfile } from '../api/index.js'
import NotificationBar from '../components/NotificationBar.jsx'
import Wordmark from '../components/Wordmark.jsx'
import { BRAND, LANDS } from '../config/brand.js'
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


function rideImage(zoneName) {
  return (LANDS.find((land) => land.zones.includes(zoneName)) ?? LANDS[1]).img
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
      if (isMember && !data.customer) {
        exitRef.current()
        return
      }
      setDashboard(data)
    } catch (err) {
      setError(err.message || 'Could not load the visitor portal.')
    } finally {
      setLoading(false)
    }
  }, [isMember])

  useEffect(() => { refresh() }, [refresh])

  const membership = dashboard?.membership
  //function to determine membership status:Expired, not active, Expires soon.
  function getMembershipStatus(membership){
    if (!membership) return 'No Membership'
    const today = localDate(0);
    if (today < membership.startDate){
      return 'Not yet Active'
    }
    if (today > membership.startDate){
      return 'Expired'
    }
    const todayDate = new Date(`${today}T12:00:00`)
    const endDate = new Date(`${membership.endDate}T12:00:00`)

    const daysRemaining = Math.ceil(
      (endDate - todayDate) / (1000 * 60 * 60 * 24)
    )

  return daysRemaining <= 30 ? 'Expiring Soon' : 'Active'
  }
  const membershipStatus = getMembershipStatus(membership)
  const isPremier = membership?.tier === 'Premier'
  const passPrice = dashboard?.prices?.dayPass ?? 59
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
  async function handleProfileUpdate(event) {
  event.preventDefault()

  setError('')
  setSuccess('')

  const formData = new FormData(event.currentTarget)

  const profile = {
    firstName: formData.get('firstName').trim(),
    lastName: formData.get('lastName').trim(),
    dob: formData.get('dob') || null,
    heightCm: formData.get('heightCm')
      ? Number(formData.get('heightCm'))
      : null,
  }

  try {
    await updateVisitorProfile(profile)
    setSuccess('Your profile has been updated.')
    await refresh()
  } catch (err) {
    setError(err.message || 'Profile update failed.')
  }
}
  async function handleRenewal(tier) {
  setError('')
  setSuccess('')

  try {
    const result = await renewVisitorMembership({ tier })

    setSuccess(
      `Your ${tier} membership has been created.`
    )

    await refresh()
  } catch (err) {
    setError(err.message || 'Membership renewal failed.')
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
    <main className="visitor-portal">
      <header className="visitor-header">
        <Link to="/" className="visitor-brand" aria-label="Thunder Valley home">
          <span className="brand-mark" aria-hidden="true">TV</span>
          <span><strong>Thunder Valley</strong><small>Adventure Park</small></span>
        </Link>
        <nav className="visitor-nav" aria-label="Visitor portal navigation">
          {isMember && <a href="#my-membership">Membership</a>}
          {isMember && <a href="#my-profile">My Profile</a>}
          {isMember && <a href="#membership-history">Membership history</a>}
          {isMember && <a href="#my-tickets">My tickets</a>}
          <a href="#rides">Rides & waits</a>
          {!isMember && <a href="#visit">Plan a visit</a>}
        </nav>
        {isMember ? (
          <span className="visitor-auth">
            <span className="demo-pill"><span /> {user?.username}</span>
            <button type="button" className="text-button" onClick={() => { logout(); navigate('/') }}>Sign out</button>
          </span>
        </div>
        <div className="vp-navbar">
          <Link to="/" className="visitor-brand" aria-label={`${BRAND.name} home`}>
            <Wordmark />
          </Link>
          <nav className="vp-nav" aria-label="Main navigation">
            {isMember && <a href="#my-membership">Membership</a>}
            {isMember && <a href="#my-tickets">My tickets</a>}
            <a href="#rides">Rides &amp; Entertainment</a>
            {!isMember && <a href="#visit">Tickets &amp; Memberships</a>}
          </nav>
          {isMember
            ? <a href="#my-tickets" className="vp-buy">Buy Tickets</a>
            : <Link to="/member/login" className="vp-buy">Buy Tickets</Link>}
        </div>
      </header>

      <NotificationBar />

      <section className="vp-hero">
        <div className="vp-hero-copy">
          <p className="vp-hero-eyebrow">{isMember ? `Welcome back${dashboard?.customer ? `, ${dashboard.customer.firstName}` : ''}` : `Welcome to ${BRAND.shortName}`}</p>
          <h1>More thrills.<br />Less waiting.</h1>
          <div className="vp-hero-actions">
            {isMember ? <a href="#my-tickets" className="vp-buy">Buy Tickets</a> : <Link to="/member/login" className="vp-buy">Buy Tickets</Link>}
            <a href="#rides" className="vp-ghost">Explore Rides</a>
          </div>
        </div>
      </section>

      <div className="visitor-content">
        {isMember && <div className="visitor-page-intro">
          <div><p className="eyebrow">THE IMPORTANT DETAILS</p><h2>{isMember ? 'Your park at a glance' : 'The park at a glance'}</h2></div>
          <button className="text-button" type="button" onClick={refresh} disabled={loading}>↻ Refresh</button>
        </div>}

        {error && <div className="visitor-alert error" role="alert"><strong>Something needs attention</strong><span>{error}</span></div>}
        {success && <div className="visitor-alert success" role="status"><strong>All set</strong><span>{success}</span><button type="button" aria-label="Dismiss message" onClick={() => setSuccess('')}>×</button></div>}

        {!isMember && landsEl}

        {isMember ? (
        <>
        <section className="overview-grid" aria-label="Park summary">
          <article className="overview-card membership-overview" id="my-membership">
          <span className={`membership-status ${membershipStatus
              .toLowerCase()
              .replaceAll(' ', '-')}`}>
              {membershipStatus}
              </span>
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

           {/* Membership History */}
        <section className="visitor-section" id="membership-history">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR ACCOUNT</p>
              <h2>Membership history</h2>
              <p>Review your previous and current memberships.</p>
            </div>
          </div>
            <button
              type="button"
              className="visitor-primary-button"
              onClick={() => handleRenewal(membership?.tier ?? 'Basic')}>
              Renew membership
            </button>
          {dashboard?.membershipHistory?.length ? (
            <div className="customer-ticket-list">
              {dashboard.membershipHistory.map((item) => (
                <article
                  className="customer-ticket"
                  key={item.membershipId}
                >
                  <div className="customer-ticket-main">
                    <strong>{item.tier} Membership</strong>
                    <span>
                      {formatDate(item.startDate)} – {formatDate(item.endDate)}
                    </span>
                    <strong>{money(item.annualPrice)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No membership history</strong>
              <p>Your previous memberships will appear here.</p>
            </div>
          )}
        </section>
        <section className="visitor-section" id="my-profile">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR ACCOUNT</p>
                <h2>My Profile</h2>
              <p>View and update your personal information.</p>
            </div>
          </div>

        <form className="profile-form" onSubmit={handleProfileUpdate}>
          <div className="profile-form-grid">
            <label>
            First Name
            <input
            type="text"
            name="firstName"
            defaultValue={dashboard?.customer?.firstName ?? ''}
            required
        />
        </label>

      <label>
        Last Name
        <input
          type="text"
          name="lastName"
          defaultValue={dashboard?.customer?.lastName ?? ''}
          required
        />
      </label>

      <label>
        Date of Birth
        <input
          type="date"
          name="dob"
          defaultValue={dashboard?.customer?.dob?.slice(0, 10) ?? ''}
        />
      </label>

      <label>
        Height (cm)
        <input
          type="number"
          name="heightCm"
          min="1"
          max="300"
          step="0.1"
          defaultValue={dashboard?.customer?.heightCm ?? ''}
          />
          </label>
          </div>
          <button
          type="submit"
          className="visitor-primary-button"
            >
             Save Changes
        </button>
        </form>
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
        <section className="vp-promo" id="visit">
          <div className="vp-promo-img" aria-hidden="true" />
          <div className="vp-promo-copy">
            <p className="vp-promo-eyebrow">Tickets &amp; Memberships</p>
            <h2>Day passes from {money(passPrice)}</h2>
            <p>Add Express queue access for {money(expressPrice)} and skip the long waits. Members get admission built in all year.</p>
            <div className="vp-promo-actions">
              <Link to="/member/login" className="vp-buy">Buy Tickets</Link>
              <Link to="/member/register" className="vp-ghost vp-ghost-dark">Become a Member</Link>
            </div>
          </div>
        </section>

        )}

        {isMember && landsEl}

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
                ) : isMember ? (
                  <div className="vp-row-wait vp-row-wait-locked"><small>Members see live wait times</small></div>
                ) : null}
              </article>
            ))}
          </div>
          {!loading && visibleRides.length === 0 && <div className="empty-state ride-empty">No rides match those filters. Try a different search.</div>}
          <p className="ride-disclaimer"><span aria-hidden="true">ⓘ</span> Status comes from the park’s live ride status.{dashboard?.waitsVisible ? ' Wait times are the latest posted reading, not a guarantee.' : ''}</p>
        </section>
      </div>

      <footer className="vp-footer">
        <div className="vp-footer-inner">
          <div className="vp-footer-brand"><Wordmark tagline={false} light /></div>
          <nav aria-label="Footer">
            <Link to="/member/login">Member sign in</Link>
            <Link to="/member/register">Join</Link>
            <Link to="/staff/login">Staff sign in</Link>
            <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
          </nav>
        </div>
        <p>{BRAND.name} · Visitor portal prototype</p>
      </footer>
    </main>
  )
}

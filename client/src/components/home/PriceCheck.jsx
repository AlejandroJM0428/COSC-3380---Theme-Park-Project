import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/context.js'
import { BRAND } from '../../config/brand.js'
import { localDate, money } from '../../utils/portalFormat.js'
import { firstOpenDate } from '../../utils/saleDates.js'
import SaleDatePicker from './SaleDatePicker.jsx'

const MAX_QTY = 6
const NO_DATES = []

// Price check inside the hero: anyone can see what a visit costs without signing in.
// The price shown is for display only; the server sets the real price when tickets are bought.
// The account step happens at checkout (/tickets), not here.
// The card is a ticket stub: the trip details on top, the total and the button on the stub below.
export default function PriceCheck({ prices, soldOutDates = NO_DATES }) {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const needsAccount = ready && user?.role !== 'Customer'
  const [picked, setPicked] = useState(null)
  const [express, setExpress] = useState(false)
  const [qty, setQty] = useState(2)

  // A sold-out date is never kept: if the chosen (or default) date sells out, the next open one is used.
  const soldOut = new Set(soldOutDates)
  const earliest = localDate(0)
  const date = firstOpenDate(picked ?? localDate(1), soldOut)

  const perTicket = prices ? prices.dayPass + (express ? prices.expressAddOn : 0) : null
  const total = perTicket == null ? null : perTicket * qty

  function submit(event) {
    event.preventDefault()
    const params = new URLSearchParams({ date, express: express ? '1' : '0', qty: String(qty) })
    navigate(`/tickets?${params.toString()}#ticket-checkout`)
  }

  return (
    <form className="pub-pc" onSubmit={submit} aria-labelledby="pub-pc-title">
      <div className="pub-pc-main">
        <h2 id="pub-pc-title" className="pub-pc-title">Check your price</h2>
        <p className="pub-pc-includes">{BRAND.dayPass.includes}</p>

        <div className="pub-pc-field">
          <span id="pub-pc-date-label">Visit date</span>
          <SaleDatePicker value={date} min={earliest} soldOut={soldOut} onChange={setPicked} labelId="pub-pc-date-label" />
        </div>

        <div className="pub-pc-field">
          <span id="pub-pc-qty-label">Tickets</span>
          <div className="pub-pc-stepper" role="group" aria-labelledby="pub-pc-qty-label">
            <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} disabled={qty <= 1} aria-label="One fewer ticket">−</button>
            <output aria-live="polite">{qty}</output>
            <button type="button" onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))} disabled={qty >= MAX_QTY} aria-label="One more ticket">+</button>
          </div>
        </div>

        <label className={`pub-pc-express ${express ? 'on' : ''}`}>
          <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} />
          <span>
            <strong>Add Express</strong>
            <small>{prices ? `Skip the queues, +${money(prices.expressAddOn)} each` : 'Skip the long queues'}</small>
          </span>
        </label>
      </div>

      <div className="pub-pc-stub">
        <div className="pub-pc-total" aria-live="polite">
          <span>{perTicket == null ? 'Total' : `${qty} × ${money(perTicket)}`}</span>
          <strong>{total == null ? '—' : money(total)}</strong>
        </div>

        {needsAccount && <p className="pub-pc-note">You’ll create a free account at checkout.</p>}
        <button type="submit" className="pub-pc-submit">Get tickets <span aria-hidden="true">→</span></button>
        <Link to="/memberships" className="pub-pc-members">Members save on every visit. See memberships</Link>
      </div>
    </form>
  )
}

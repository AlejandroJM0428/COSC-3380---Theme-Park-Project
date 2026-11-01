import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/context.js'
import { localDate, money } from '../../utils/portalFormat.js'

const MAX_QTY = 6

// Price check inside the hero: anyone can see what a visit costs without signing in.
// The price shown is for display only; the server sets the real price when tickets are bought.
// The account step happens at checkout (/tickets), not here.
export default function PriceCheck({ prices }) {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const needsAccount = ready && user?.role !== 'Customer'
  const [date, setDate] = useState(() => localDate(1))
  const [express, setExpress] = useState(false)
  const [qty, setQty] = useState(2)

  const perTicket = prices ? prices.dayPass + (express ? prices.expressAddOn : 0) : null
  const total = perTicket == null ? null : perTicket * qty

  function submit(event) {
    event.preventDefault()
    const params = new URLSearchParams({ date, express: express ? '1' : '0', qty: String(qty) })
    navigate(`/tickets?${params.toString()}`)
  }

  return (
    <form className="pub-pc" onSubmit={submit} aria-labelledby="pub-pc-title">
      <h2 id="pub-pc-title" className="pub-pc-title">Check your price</h2>

      <label className="pub-pc-field">
        <span>Visit date</span>
        <input type="date" value={date} min={localDate(0)} onChange={(e) => setDate(e.target.value)} required />
      </label>

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

      <div className="pub-pc-total" aria-live="polite">
        <span>{perTicket == null ? 'Total' : `${qty} × ${money(perTicket)}`}</span>
        <strong>{total == null ? '—' : money(total)}</strong>
      </div>

      <button type="submit" className="pub-pc-submit">Continue <span aria-hidden="true">→</span></button>
      {needsAccount && <p className="pub-pc-note">A free account is needed to complete your order.</p>}
    </form>
  )
}

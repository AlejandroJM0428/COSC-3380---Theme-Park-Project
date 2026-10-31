import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDate, money } from '../utils/portalFormat.js'

// The main conversion element: pick a date, toggle Express, see the price, go to checkout.
// The price shown is for display only; the server sets the real price when a ticket is bought.
export default function QuickBuy({ prices }) {
  const navigate = useNavigate()
  const [date, setDate] = useState(() => localDate(1))
  const [express, setExpress] = useState(false)

  const total = prices ? prices.dayPass + (express ? prices.expressAddOn : 0) : null

  function submit(event) {
    event.preventDefault()
    const params = new URLSearchParams({ date, express: express ? '1' : '0' })
    navigate(`/tickets?${params.toString()}`)
  }

  return (
    <form className="pub-quickbuy" onSubmit={submit} aria-label="Buy tickets">
      <label className="pub-qb-field">
        <span>Visit date</span>
        <input type="date" value={date} min={localDate(0)} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <label className="pub-qb-express">
        <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} />
        <span>
          <strong>Add Express</strong>
          <small>{prices ? `+${money(prices.expressAddOn)} per ticket` : 'Skip the long queues'}</small>
        </span>
      </label>

      <div className="pub-qb-price" aria-live="polite">
        <span>{express ? 'Day pass + Express' : 'Day pass'}</span>
        <strong>{total == null ? '—' : money(total)}</strong>
      </div>

      <button type="submit" className="pub-qb-submit">Get Tickets <span aria-hidden="true">→</span></button>
    </form>
  )
}

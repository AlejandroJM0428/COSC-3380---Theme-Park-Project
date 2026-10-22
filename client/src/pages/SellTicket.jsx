import { useState } from 'react'
import { createTicket } from '../api'
import ErrorBanner from '../components/ErrorBanner.jsx'

export default function SellTicket() {
  const [customerId, setCustomerId] = useState('')
  const [membershipId, setMembershipId] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [hasExpress, setHasExpress] = useState(false)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaved(null)
    try {
      setSaved(
        await createTicket({
          customerId: Number(customerId),
          membershipId: membershipId === '' ? null : Number(membershipId),
          visitDate,
          hasExpress,
        }),
      )
    } catch (err) {
      setError(err.message) // trigger text from the database shows here
    }
  }

  return (
    <div>
      <h1>Sell Ticket</h1>
      <p className="muted">The database sets the price. Rules like weekday-only memberships are checked when you save.</p>
      <form onSubmit={submit} className="panel sell-form">
        <label>
          Customer ID
          <input type="number" min="1" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required />
        </label>
        <label>
          Membership ID (optional)
          <input type="number" min="1" value={membershipId} onChange={(e) => setMembershipId(e.target.value)} />
        </label>
        <label>
          Visit date
          <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={hasExpress} onChange={(e) => setHasExpress(e.target.checked)} />
          Express add-on
        </label>
        <button type="submit">Save ticket</button>
      </form>

      <ErrorBanner message={error} onClose={() => setError('')} />
      {saved && (
        <p className="result allowed">
          <strong>Ticket #{saved.TicketID} saved.</strong> Price set by the database: ${saved.TicketPrice}.
        </p>
      )}
    </div>
  )
}

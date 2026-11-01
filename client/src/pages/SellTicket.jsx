import { useState } from 'react'
import { createTicket } from '../api'
import ErrorBanner from '../components/ErrorBanner.jsx'
import CustomerLookup, { membershipStatus } from '../components/CustomerLookup.jsx'

// Local date as YYYY-MM-DD.
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Step 1: find the guest by name or date of birth. Step 2: pick the visit date and Express, then save.
// Nobody types an ID. The chosen guest's customer and membership IDs are kept in state and sent with the ticket.
export default function SellTicket() {
  const [guest, setGuest] = useState(null) // the row picked in the lookup
  const [visitDate, setVisitDate] = useState(today)
  const [hasExpress, setHasExpress] = useState(false)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')

  // The lookup finds the membership that covers today. It only applies to the ticket if it is still running on the visit date.
  const membershipApplies = Boolean(guest?.MembershipID) && (!guest.MembershipEnd || String(guest.MembershipEnd).slice(0, 10) >= visitDate)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaved(null)
    try {
      setSaved(
        await createTicket({
          customerId: Number(guest.CustomerID),
          membershipId: membershipApplies ? Number(guest.MembershipID) : null,
          visitDate,
          hasExpress,
        }),
      )
    } catch (err) {
      setError(err.message) // trigger text from the database shows here
    }
  }

  function chooseAnother() {
    setGuest(null)
    setSaved(null)
    setError('')
  }

  return (
    <div>
      <h1>Sell Ticket</h1>
      <p className="muted">The database sets the price. Rules like weekday-only memberships are checked when you save.</p>

      {!guest && (
        <CustomerLookup
          onPick={(c) => {
            setGuest(c)
            setSaved(null)
            setError('')
          }}
        />
      )}

      {guest && (
        <>
          <div className="panel sell-guest">
            <div>
              <strong>{guest.FullName}</strong>
              <span className="muted"> · DOB: {guest.DOB}</span>
              <span className="sell-guest-member">{membershipStatus(guest)}</span>
              {guest.MembershipID && !membershipApplies && (
                <span className="sell-guest-member">This membership ends before the visit date, so the ticket is sold at the regular price.</span>
              )}
            </div>
            <button type='button' onClick={chooseAnother}>
              Choose another guest
            </button>
          </div>

          <form onSubmit={submit} className="panel sell-form">
            <label>
              Visit date
              <input type='date' min={today()} value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
            </label>
            <label className="check">
              <input type='checkbox' checked={hasExpress} onChange={(e) => setHasExpress(e.target.checked)} />
              Express add-on
            </label>
            <button type='submit'>Save ticket</button>
          </form>
        </>
      )}

      <ErrorBanner message={error} onClose={() => setError('')} />
      {saved && (
        <p className="result allowed">
          <strong>Ticket #{saved.TicketID} saved.</strong> Price set by the database: ${saved.TicketPrice}.
        </p>
      )}
    </div>
  )
}

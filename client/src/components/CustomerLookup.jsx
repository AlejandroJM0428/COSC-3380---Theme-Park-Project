import { useState } from 'react'
import { searchCustomers } from '../api'
import ErrorBanner from './ErrorBanner.jsx'
import './CustomerLookup.css'

// Membership status line for a search result (also used by the Sell Ticket page for the chosen guest).
export function membershipStatus(c) {
  if (c.MembershipID) {
    const weekdays = c.Tier === 'Basic' ? ' (weekdays only)' : ''
    return `${c.Tier} member${weekdays} until ${c.MembershipEnd}`
  }
  if (c.LastMembershipEnd) return `Membership expired ${c.LastMembershipEnd}`
  return 'No membership'
}

// "Find customer" box: search by name, date of birth, or both, then click a result.
// onPick(customer) gets the full row ({ CustomerID, FullName, DOB, MembershipID, ... }) so the page can fill
// the chosen guest and, when the customer has a membership, the membership. No ID is typed or shown to the user.
export default function CustomerLookup({ onPick }) {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [results, setResults] = useState(null) // null = not searched yet
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() && !dob) {
      setError('Enter a name, a date of birth, or both.')
      return
    }
    setBusy(true)
    try {
      setResults(await searchCustomers(name.trim(), dob))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function pick(customer) {
    onPick(customer)
    setResults(null)
  }

  return (
    <form className="panel customer-lookup" onSubmit={search}>
      <h2>Find customer</h2>
      <div className="cl-row">
        <label>
          Name
          <input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Lopez" maxLength={60} />
        </label>
        <label>
          Date of birth
          <input id="cl-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {results && results.length === 0 && <p className="muted">No active customers match. Verify that the name and date of birth are correct.</p>}
      {results && results.length > 0 && (
        <ul className="cl-results">
          {results.map((c) => (
            <li key={c.CustomerID}>
              <button type="button" onClick={() => pick(c)}>
                <strong>{c.FullName}</strong> · DOB: {c.DOB}
                <span className={`cl-member ${c.MembershipID ? 'is-member' : ''}`}>{membershipStatus(c)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 20 && <p className="muted">Showing the first 20 results. Add more information to narrow down the results.</p>}
    </form>
  )
}

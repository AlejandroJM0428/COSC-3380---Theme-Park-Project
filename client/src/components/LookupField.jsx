import { useEffect, useState } from 'react'
import { getRecord, listRecords, searchCustomers } from '../api'
import ErrorBanner from './ErrorBanner.jsx'
import './LookupField.css'

// A form field that picks a record by what a person knows (a guest's name, a visit date) instead of an ID.
// The form still stores the ID as a string, so each config's toPayload / fromRecord keep working. The ID is never shown.
//
//   kind 'customer'   search by name and/or date of birth, click the guest
//   kind 'ticket'     search active tickets by guest name and/or visit date, click the ticket
//   kind 'membership' a pick list of the chosen guest's memberships (needs forCustomer = that guest's id)

const dateOnly = (s) => (s ? String(s).slice(0, 10) : '')
const money = (v) => (v === null || v === undefined ? '' : `$${Number(v).toFixed(2)}`)

export function customerText(c) {
  return `${c.FullName ?? `${c.FirstName} ${c.LastName}`} · DOB: ${dateOnly(c.DOB)}`
}

export function ticketText(t) {
  const parts = [t.CustomerName, `visit ${dateOnly(t.VisitDate)}`, money(t.TicketPrice)]
  if (Number(t.HasExpress)) parts.push('Express')
  if (Number(t.IsVoided)) parts.push('refunded')
  return parts.filter(Boolean).join(' · ')
}

export function membershipText(m) {
  return `${m.Tier} · ${dateOnly(m.StartDate)} to ${dateOnly(m.EndDate)}${Number(m.IsCurrent) ? ' (current)' : ''}`
}

const RESOURCE = { customer: 'customers', ticket: 'tickets' }

// Shows the chosen record as plain text. When the form opens with an ID already set (Edit), the record is loaded for its text.
function useChosenText(kind, value) {
  const [loaded, setLoaded] = useState({ value: '', text: '' })

  useEffect(() => {
    if (!value || kind === 'membership') return undefined
    let alive = true
    getRecord(RESOURCE[kind], value)
      .then((rec) => alive && setLoaded({ value, text: kind === 'customer' ? customerText(rec) : ticketText(rec) }))
      .catch(() => alive && setLoaded({ value, text: 'Selected' }))
    return () => {
      alive = false
    }
  }, [kind, value])

  if (!value) return ''
  return loaded.value === value ? loaded.text : 'Loading…'
}

function CustomerSearch({ onPick }) {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search() {
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

  return (
    <div className="lf-box">
      <div className="lf-row">
        <label>
          Guest name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Lopez" maxLength={60} />
        </label>
        <label>
          Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <button type="button" onClick={search} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {results && results.length === 0 && <p className="muted">No active guests match.</p>}
      {results && results.length > 0 && (
        <ul className="lf-results">
          {results.map((c) => (
            <li key={c.CustomerID}>
              <button type="button" onClick={() => onPick(String(c.CustomerID), customerText(c))}>
                {customerText(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TicketSearch({ onPick }) {
  const [name, setName] = useState('')
  const [visit, setVisit] = useState('')
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    listRecords('tickets', { status: 'active' })
      .then((rows) => alive && setTickets(rows))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [])

  const needle = name.trim().toLowerCase()
  const matches = (tickets ?? []).filter(
    (t) => (!needle || t.CustomerName.toLowerCase().includes(needle)) && (!visit || dateOnly(t.VisitDate) === visit),
  )
  const searched = Boolean(needle || visit)

  return (
    <div className="lf-box">
      <div className="lf-row">
        <label>
          Guest name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Lopez" maxLength={60} />
        </label>
        <label>
          Visit date
          <input type="date" value={visit} onChange={(e) => setVisit(e.target.value)} />
        </label>
      </div>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {tickets === null && !error && <p className="muted">Loading tickets…</p>}
      {tickets && !searched && <p className="muted">Type a guest name or pick a visit date to find the ticket.</p>}
      {tickets && searched && matches.length === 0 && <p className="muted">No active tickets match.</p>}
      {tickets && searched && matches.length > 0 && (
        <ul className="lf-results">
          {matches.slice(0, 20).map((t) => (
            <li key={t.TicketID}>
              <button type="button" onClick={() => onPick(String(t.TicketID), ticketText(t))}>
                {ticketText(t)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches.length > 20 && <p className="muted">Showing the first 20. Add more information to narrow down the results.</p>}
    </div>
  )
}

// The guest's memberships as a pick list. Clears itself when the chosen guest changes and the old choice no longer fits.
function MembershipSelect({ id, value, customerId, required, onChange }) {
  const [state, setState] = useState({ customerId: '', rows: [] })

  useEffect(() => {
    if (!customerId) return undefined
    let alive = true
    listRecords('memberships')
      .then((rows) => alive && setState({ customerId, rows: rows.filter((m) => String(m.CustomerID) === String(customerId)) }))
      .catch(() => alive && setState({ customerId, rows: [] }))
    return () => {
      alive = false
    }
  }, [customerId])

  const rows = customerId && state.customerId === customerId ? state.rows : []
  const ready = Boolean(customerId) && state.customerId === customerId

  useEffect(() => {
    if (ready && value && !rows.some((m) => String(m.MembershipID) === String(value))) onChange('')
  }, [ready, rows, value, onChange])

  if (!customerId) return <p className="muted">Choose the guest first.</p>
  return (
    <select id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)}>
      <option value="">{rows.length === 0 && ready ? 'No membership on file' : 'No membership'}</option>
      {rows.map((m) => (
        <option key={m.MembershipID} value={String(m.MembershipID)}>
          {membershipText(m)}
        </option>
      ))}
    </select>
  )
}

export default function LookupField({ id, kind, value, onChange, required, forCustomer }) {
  const [searching, setSearching] = useState(false)
  const [pickedText, setPickedText] = useState({ value: '', text: '' })
  const loadedText = useChosenText(kind, value)
  const text = pickedText.value === value && pickedText.text ? pickedText.text : loadedText

  if (kind === 'membership') {
    return <MembershipSelect id={id} value={value} customerId={forCustomer} required={required} onChange={onChange} />
  }

  function pick(newValue, newText) {
    setPickedText({ value: newValue, text: newText })
    onChange(newValue)
    setSearching(false)
  }

  const noun = kind === 'customer' ? 'guest' : 'ticket'
  const Search = kind === 'customer' ? CustomerSearch : TicketSearch

  return (
    <div className="lf" id={id}>
      {value && !searching ? (
        <div className="lf-chosen">
          <span>{text}</span>
          <button type="button" onClick={() => setSearching(true)}>
            Choose another {noun}
          </button>
        </div>
      ) : (
        <>
          <Search onPick={pick} />
          {value && (
            <button type="button" onClick={() => setSearching(false)}>
              Keep the current {noun}
            </button>
          )}
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { approveCancellation, listCancellations, rejectCancellation } from '../api/index.js'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { clock, formatDate } from '../utils/portalFormat.js'
import './CancellationsPage.css'

const FILTERS = ['Pending', 'Approved', 'Rejected', 'All']
const NOTE_MAX = 200

// MySQL sends 'YYYY-MM-DD HH:MM:SS' for times and 'YYYY-MM-DD' for dates.
const dayOf = (value) => formatDate(String(value ?? '').slice(0, 10))
const dayAndTime = (value) => {
  const time = clock(String(value ?? '').slice(11, 16))
  return time ? `${dayOf(value)}, ${time}` : dayOf(value)
}

// One request. A Pending request has a note box and the two decision buttons. A decided one shows who decided and when.
function RequestCard({ row, busy, onDecide }) {
  const [note, setNote] = useState('')
  const pending = row.status === 'Pending'

  return (
    <article className="cx-card" data-status={row.status}>
      <header className="cx-head">
        <div>
          <h3>{row.customerName}</h3>
          <p className="muted">
            {row.tier} membership #{row.membershipId} · customer #{row.customerId}
          </p>
        </div>
        <span className="cx-status" data-status={row.status}>
          {row.status}
        </span>
      </header>

      <p className="cx-reason">{row.reason}</p>

      <dl className="cx-facts">
        <div>
          <dt>Asked</dt>
          <dd>{dayAndTime(row.requestedAt)}</dd>
        </div>
        <div>
          <dt>Active until</dt>
          <dd>{dayOf(row.endDate)}</dd>
        </div>
        <div>
          <dt>Auto-renew now</dt>
          <dd>{row.autoRenew ? 'On' : 'Off'}</dd>
        </div>
      </dl>

      {pending ? (
        <div className="cx-decide">
          <label className="rm-field">
            Note to the member (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} disabled={busy} />
          </label>
          <div className="button-row">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => onDecide(row, 'approve', note)}>
              Approve
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => onDecide(row, 'reject', note)}>
              Reject
            </button>
          </div>
        </div>
      ) : (
        <p className="cx-decided">
          {row.status} by {row.decidedBy ?? 'a reviewer'} on {dayAndTime(row.decidedAt)}.
          {row.decisionNote ? <> Note: {row.decisionNote}</> : null}
        </p>
      )}
    </article>
  )
}

// Staff review of membership cancellation requests (Admin and the retail desk).
// A cancellation is a request. Approving turns auto-renew off. It does not end the membership early and it does not refund anything.
export default function CancellationsPage() {
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('Pending')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  // Promise.resolve().then(...) turns an immediate throw into a normal rejection that the banner can show.
  const load = useCallback(() => {
    return Promise.resolve()
      .then(() => listCancellations())
      .then(setRows)
      .catch((err) => {
        setRows((old) => old ?? [])
        setError(err.message)
      })
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function decide(row, decision, note) {
    const approving = decision === 'approve'
    const question = approving
      ? `Approve the request from ${row.customerName}? Auto-renew will be turned off. The membership stays active until ${dayOf(row.endDate)} and nothing is refunded.`
      : `Reject the request from ${row.customerName}? The membership and auto-renew stay as they are.`
    if (!window.confirm(question)) return

    setError('')
    setNotice('')
    setBusyId(row.requestId)
    try {
      await (approving ? approveCancellation : rejectCancellation)(row.requestId, note.trim())
      setNotice(
        approving
          ? `Approved. Auto-renew is now off for ${row.customerName}, and the membership runs to ${dayOf(row.endDate)}.`
          : `Rejected. ${row.customerName}'s membership is unchanged.`,
      )
    } catch (err) {
      // A 409 means another reviewer decided it first. Reloading shows the real state.
      setError(err.message)
    } finally {
      setBusyId(null)
      await load()
    }
  }

  const counts = { All: rows?.length ?? 0 }
  for (const f of FILTERS) if (f !== 'All') counts[f] = rows?.filter((r) => r.status === f).length ?? 0
  const shown = rows?.filter((r) => filter === 'All' || r.status === filter) ?? []

  return (
    <div className="cx-page">
      <h1>Membership cancellations</h1>
      <p>
        A member asks to cancel. Approving turns auto-renew off, so the membership ends on its normal end date. It does not end early and nothing is refunded. Rejecting changes nothing.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {notice && <p className="page-note">{notice}</p>}

      <div className="tabs" role="group" aria-label="Show requests">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="muted">{filter === 'Pending' ? 'No requests are waiting for a decision.' : `No ${filter === 'All' ? '' : `${filter.toLowerCase()} `}requests.`}</p>
      ) : (
        <div className="cx-list">
          {shown.map((row) => (
            <RequestCard key={row.requestId} row={row} busy={busyId === row.requestId} onDecide={decide} />
          ))}
        </div>
      )}
    </div>
  )
}

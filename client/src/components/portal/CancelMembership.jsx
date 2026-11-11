import { useCallback, useEffect, useRef, useState } from 'react'
import { getMyCancellations, requestCancellation } from '../../api/index.js'
import { formatDate } from '../../utils/portalFormat.js'

const MAX_REASON = 200

// "2026-11-01 14:05:00" -> "Nov 1, 2026"
const day = (value) => formatDate(String(value ?? '').slice(0, 10))

// Cancel button for the membership tab. Cancelling is a REQUEST: a manager approves or rejects it.
// If approved, auto-renew is switched off and the membership runs to its normal end date. No refund is given.
//   messages: { clear, fail(err, fallback), ok(text), notice(obj) } from the portal page
// Everything comes from GET /api/cancellations/mine. The page never sends a membership id.
export default function CancelMembership({ messages }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const sendLock = useRef(false)

  const reload = useCallback(async () => {
    try {
      const data = await getMyCancellations()
      setState({ loading: false, data, error: '' })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || 'Could not check your cancellation requests.' }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    getMyCancellations()
      .then((data) => { if (alive) setState({ loading: false, data, error: '' }) })
      .catch((err) => { if (alive) setState((s) => ({ ...s, loading: false, error: err.message || 'Could not check your cancellation requests.' })) })
    return () => { alive = false }
  }, [])

  const data = state.data
  const pending = data?.requests.find((r) => r.status === 'Pending')
  const endDate = data?.membership?.endDate

  async function handleSend(event) {
    event.preventDefault()
    if (sendLock.current) return
    sendLock.current = true
    messages.clear()
    setSending(true)
    try {
      await requestCancellation(reason)
      messages.ok(`Your cancellation request was sent. A manager will review it. Your membership stays active until ${formatDate(endDate)}.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setOpen(false)
      setReason('')
      await reload()
    } catch (err) {
      messages.fail(err, 'Could not send your request.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      await reload() // the answer may have changed, for example a request was already waiting
    } finally {
      setSending(false)
      sendLock.current = false
    }
  }

  return (
    <section className="pt-card pt-cancel" aria-labelledby="pt-cancel-title">
      <h2 id="pt-cancel-title">Cancel membership</h2>

      {state.loading && <p className="pt-sub">Checking your membership…</p>}
      {state.error && <p className="pt-fine pt-fine-error" role="alert">{state.error}</p>}

      {data && pending && (
        <div className="pt-cancel-pending" role="status">
          <p><span className="pt-pill pt-pill-pending">Waiting for review</span> Sent {day(pending.requestedAt)}</p>
          <p className="pt-sub">Reason you gave: {pending.reason}</p>
          <p className="pt-fine">A manager will approve or reject it. Your membership stays active until {formatDate(endDate)} either way.</p>
        </div>
      )}

      {data && !pending && data.canRequest && !open && (
        <>
          <p className="pt-sub">Ask to stop your membership from renewing. A manager reviews every request.</p>
          <button type="button" className="pt-btn pt-btn-ghost" onClick={() => setOpen(true)}>Request cancellation</button>
        </>
      )}

      {data && !pending && data.canRequest && open && (
        <form className="pt-form" onSubmit={handleSend}>
          <ul className="pt-cancel-facts">
            <li>This sends a request. Nothing changes until a manager approves it.</li>
            <li>If approved, your membership will not renew.</li>
            <li>It stays active until {formatDate(endDate)}, so you keep your benefits until then.</li>
            <li>The park does not refund the current year.</li>
          </ul>
          <label htmlFor="pt-cancel-reason">Why would you like to cancel?</label>
          <textarea id="pt-cancel-reason" rows={3} maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} disabled={sending} required />
          <p className="pt-fine">{reason.length} of {MAX_REASON} characters</p>
          <div className="pt-actions">
            <button type="submit" className="pt-btn" disabled={sending || reason.trim() === ''}>{sending ? 'Sending…' : 'Send request'}</button>
            <button type="button" className="pt-btn pt-btn-ghost" onClick={() => { setOpen(false); setReason('') }} disabled={sending}>Keep my membership</button>
          </div>
        </form>
      )}

      {data && !pending && !data.canRequest && data.blockedReason && <p className="pt-sub">{data.blockedReason}</p>}

      {data?.requests.length > 0 && (
        <details className="pt-history pt-cancel-history">
          <summary>Your requests ({data.requests.length})</summary>
          <ul className="pt-cancel-list">
            {data.requests.map((r) => (
              <li key={r.requestId}>
                <p><span className={`pt-pill pt-pill-${r.status.toLowerCase()}`}>{r.status}</span> {r.tier} membership · sent {day(r.requestedAt)}{r.decidedAt ? ` · decided ${day(r.decidedAt)}` : ''}</p>
                <p className="pt-sub">Your reason: {r.reason}</p>
                {r.status === 'Approved' && <p className="pt-sub">Your membership will not renew and ends on {formatDate(r.endDate)}.</p>}
                {r.status === 'Rejected' && <p className="pt-sub">Your membership was not changed.</p>}
                {r.decisionNote && <p className="pt-sub">Note from the park: {r.decisionNote}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { buyDependentTicket, quoteDependentTicket, refundDependentTicket, removeDependent, updateDependent } from '../../api/index.js'
import { formatDate, localDate, money } from '../../utils/portalFormat.js'
import { dobWindow } from './familyDates.js'

// One dependent: details, edit, remove, a ticket form with a live price, and their tickets.
//   dep:       { customerId, firstName, dob, age, heightCm, consentedAt, tickets[] } from GET /api/family
//   onChanged: reload the family list
//   messages:  { clear, fail(err, fallback), ok(text), notice(obj) } from FamilyTab
// The price shown comes from the server's quote route (the same functions the ticket trigger uses).
// The browser never works out or sends a price, and it never hard-codes the discount percentages.
export default function DependentCard({ dep, onChanged, messages }) {
  const today = localDate(0)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ firstName: dep.firstName, dob: dep.dob, heightCm: String(dep.heightCm) })
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const [buyOpen, setBuyOpen] = useState(false)
  const [visitDate, setVisitDate] = useState(() => localDate(6))
  const [hasExpress, setHasExpress] = useState(false)
  const [buying, setBuying] = useState(false)
  const [refundBusy, setRefundBusy] = useState(null)
  const buyLock = useRef(false)

  // The quote is stored with the inputs it was made for. A reply for older inputs is simply not shown,
  // so a slow answer can never overwrite a newer one.
  const quoteKey = `${dep.customerId}|${visitDate}|${hasExpress}`
  const [quoteState, setQuoteState] = useState({ key: '', data: null, error: '' })
  useEffect(() => {
    if (!buyOpen || !visitDate) return undefined
    let alive = true
    quoteDependentTicket(dep.customerId, visitDate, hasExpress)
      .then((data) => { if (alive) setQuoteState({ key: quoteKey, data, error: '' }) })
      .catch((err) => { if (alive) setQuoteState({ key: quoteKey, data: null, error: err.message || 'Could not get the price.' }) })
    return () => { alive = false }
  }, [buyOpen, visitDate, hasExpress, dep.customerId, quoteKey])
  const quote = quoteState.key === quoteKey ? quoteState : null

  const dobRange = dobWindow()
  const upcoming = dep.tickets.filter((t) => t.status !== 'Refunded' && t.visitDate >= today).sort((a, b) => a.visitDate.localeCompare(b.visitDate))
  const past = dep.tickets.filter((t) => t.status === 'Refunded' || t.visitDate < today)

  // Opening the editor always starts from what is saved, so a cancelled edit leaves nothing behind.
  function toggleEdit() {
    if (!editing) setForm({ firstName: dep.firstName, dob: dep.dob, heightCm: String(dep.heightCm) })
    setEditing((v) => !v)
  }

  async function handleSave(event) {
    event.preventDefault()
    if (saving) return
    messages.clear()
    setSaving(true)
    try {
      await updateDependent(dep.customerId, { firstName: form.firstName, dob: form.dob, heightCm: Number(form.heightCm) })
      messages.ok(`${form.firstName.trim()}'s details were saved.`)
      setEditing(false)
      await onChanged()
    } catch (err) {
      messages.fail(err, 'Could not save the changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    const approved = window.confirm(
      `Remove ${dep.firstName}? Their name is taken off the park's records and this cannot be undone. Past tickets stay in the park's sales records. You can add them again later.`,
    )
    if (!approved) return
    messages.clear()
    setRemoving(true)
    try {
      await removeDependent(dep.customerId)
      messages.ok(`${dep.firstName} was removed.`)
      await onChanged()
    } catch (err) {
      messages.fail(err, 'Could not remove them.')
    } finally {
      setRemoving(false)
    }
  }

  async function handleBuy(event) {
    event.preventDefault()
    if (buyLock.current) return
    buyLock.current = true
    messages.clear()
    setBuying(true)
    try {
      const ticket = await buyDependentTicket(dep.customerId, { visitDate, hasExpress })
      const text = `Ticket #${ticket.ticketId} for ${dep.firstName} is confirmed for ${formatDate(ticket.visitDate)} (${money(ticket.ticketPrice)}).`
      if (ticket.firedTriggers?.length > 0) messages.notice({ variant: 'fired', title: `Ticket confirmed for ${dep.firstName}`, message: text, fired: ticket.firedTriggers })
      else messages.ok(text)
      setHasExpress(false)
      setBuyOpen(false)
      await onChanged()
    } catch (err) {
      messages.fail(err, 'Ticket purchase failed.')
    } finally {
      setBuying(false)
      buyLock.current = false
    }
  }

  async function handleRefund(ticket) {
    const approved = window.confirm(`Refund ticket #${ticket.ticketId} for ${dep.firstName} on ${formatDate(ticket.visitDate)}? No real money is moved in this prototype.`)
    if (!approved) return
    messages.clear()
    setRefundBusy(ticket.ticketId)
    try {
      await refundDependentTicket(ticket.ticketId)
      messages.ok(`Ticket #${ticket.ticketId} has been refunded.`)
      await onChanged()
    } catch (err) {
      messages.fail(err, 'Refund failed.')
    } finally {
      setRefundBusy(null)
    }
  }

  const q = quote?.data
  const canBuy = Boolean(q) && visitDate >= today && !buying

  return (
    <article className="pt-card pt-dep">
      <header className="pt-dep-head">
        <div>
          <h3 className="pt-dep-name">{dep.firstName}</h3>
          <p className="pt-sub">Age {dep.age} · {dep.heightCm} cm · born {formatDate(dep.dob)}</p>
        </div>
        <div className="pt-actions">
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => setBuyOpen((v) => !v)} aria-expanded={buyOpen}>{buyOpen ? 'Close' : 'Buy ticket'}</button>
          <button type="button" className="pt-btn pt-btn-sm pt-btn-ghost" onClick={toggleEdit} aria-expanded={editing}>{editing ? 'Cancel edit' : 'Edit'}</button>
          <button type="button" className="pt-btn pt-btn-sm pt-btn-ghost" onClick={handleRemove} disabled={removing}>{removing ? 'Removing…' : 'Remove'}</button>
        </div>
      </header>

      {editing && (
        <form className="pt-form pt-dep-form" onSubmit={handleSave}>
          <label htmlFor={`dep-fn-${dep.customerId}`}>First name</label>
          <input id={`dep-fn-${dep.customerId}`} type="text" maxLength={50} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <label htmlFor={`dep-dob-${dep.customerId}`}>Date of birth</label>
          <input id={`dep-dob-${dep.customerId}`} type="date" min={dobRange.min} max={dobRange.max} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
          <label htmlFor={`dep-ht-${dep.customerId}`}>Height (cm)</label>
          <input id={`dep-ht-${dep.customerId}`} type="number" min={30} max={260} step={1} value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} required />
          <p className="pt-fine">Height decides which rides they can board, so keep it up to date.</p>
          <div><button type="submit" className="pt-btn pt-btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      )}

      {buyOpen && (
        <form className="pt-form pt-dep-form" onSubmit={handleBuy}>
          <label htmlFor={`dep-date-${dep.customerId}`}>Visit date</label>
          <input id={`dep-date-${dep.customerId}`} type="date" value={visitDate} min={today} onChange={(e) => setVisitDate(e.target.value)} required />
          <label className="pt-check" htmlFor={`dep-exp-${dep.customerId}`}>
            <input id={`dep-exp-${dep.customerId}`} type="checkbox" checked={hasExpress} onChange={(e) => setHasExpress(e.target.checked)} />
            <span>Express queue access<small>Skip the long queues</small></span>
            <strong>{q ? `+${money(q.expressAddOn)}` : ''}</strong>
          </label>

          {quote?.error && <p className="pt-fine pt-fine-error" role="alert">{quote.error}</p>}
          {!quote && visitDate && <p className="pt-fine">Checking the price…</p>}
          {q && (
            <>
              <div className="pt-line"><span>Day pass</span><strong>{money(q.dayPass)}</strong></div>
              {q.discountPct > 0 && (
                <div className="pt-line"><span>{q.discountPct >= 100 ? 'Free entry (under 3)' : `Dependent discount (${Number(q.discountPct)}% off)`}</span><strong>−{money(q.discount)}</strong></div>
              )}
              {hasExpress && <div className="pt-line"><span>Express queue access</span><strong>{money(q.expressAddOn)}</strong></div>}
              <div className="pt-line pt-total"><span>Due today</span><strong>{money(q.total)}</strong></div>
            </>
          )}
          <p className="pt-fine">No payment is taken in this prototype. The park sets the price, not this page.</p>
          <div><button type="submit" className="pt-btn" disabled={!canBuy}>{buying ? 'Booking…' : `Confirm ticket for ${dep.firstName}`}</button></div>
        </form>
      )}

      <h4 className="pt-dep-sub">Upcoming tickets <span className="pt-count">{upcoming.length}</span></h4>
      {upcoming.length === 0 ? <p className="pt-fine pt-dep-none">No upcoming tickets.</p> : (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead><tr><th scope="col">Date</th><th scope="col">Ticket</th><th scope="col">Queue</th><th scope="col" className="pt-num">Price</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {upcoming.map((t) => {
                const sameDay = t.visitDate <= today
                return (
                  <tr key={t.ticketId}>
                    <td>{formatDate(t.visitDate)}</td>
                    <td>#{t.ticketId}</td>
                    <td>{t.hasExpress ? 'Express' : 'Standard'}</td>
                    <td className="pt-num">{money(t.ticketPrice)}</td>
                    <td className="pt-num">
                      <button type="button" className="pt-btn pt-btn-sm pt-btn-ghost" onClick={() => handleRefund(t)} disabled={refundBusy === t.ticketId || sameDay} title={sameDay ? 'Refunds are only available before the visit date.' : 'Refund this ticket'}>
                        {refundBusy === t.ticketId ? 'Refunding…' : sameDay ? 'Visit day' : 'Refund'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {past.length > 0 && (
        <details className="pt-history pt-dep-past">
          <summary>Past &amp; refunded tickets ({past.length})</summary>
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col" className="pt-num">Price</th></tr></thead>
              <tbody>
                {past.map((t) => (
                  <tr key={t.ticketId}><td>{formatDate(t.visitDate)}</td><td>#{t.ticketId}</td><td><span className={`pt-pill pt-pill-${t.status.toLowerCase()}`}>{t.status}</span></td><td className="pt-num">{money(t.ticketPrice)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  )
}

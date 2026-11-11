import { formatDate, localDate, money } from '../../utils/portalFormat.js'

// Tickets: a compact purchase form, a table of upcoming tickets with Refund, and past/refunded history.
export default function TicketsTab({ form, upcoming, past, loading, refundBusy, onRefund }) {
  const { visitDate, setVisitDate, hasExpress, setHasExpress, isPremier, membership, passPrice, expressPrice, totalPrice, purchasing, onSubmit } = form
  const today = localDate(0)

  return (
    <div className="pt-split">
      <form className="pt-card pt-form" onSubmit={onSubmit}>
        <h2>Get a ticket</h2>
        <label htmlFor="pt-visit-date">Visit date</label>
        <input id="pt-visit-date" type="date" value={visitDate} min={today} onChange={(e) => setVisitDate(e.target.value)} required />

        <div className="pt-line"><span>{membership ? `${membership.tier} member admission` : 'Day pass'}</span><strong>{money(membership ? 0 : passPrice)}</strong></div>
        <label className="pt-check" htmlFor="pt-express">
          <input id="pt-express" type="checkbox" checked={isPremier || hasExpress} disabled={isPremier} onChange={(e) => setHasExpress(e.target.checked)} />
          <span>Express queue access<small>{isPremier ? 'Included with Premier' : 'Skip the long queues'}</small></span>
          <strong>{isPremier ? 'Included' : `+${money(expressPrice)}`}</strong>
        </label>
        <div className="pt-line pt-total"><span>Due today</span><strong>{money(totalPrice)}</strong></div>
        <p className="pt-fine">No payment is taken in this prototype.</p>
        <button type="submit" className="pt-btn" disabled={purchasing || loading}>{purchasing ? 'Booking…' : 'Confirm ticket'}</button>
      </form>

      <div>
        <section className="pt-card pt-flush" id="my-tickets">
          <h2 className="pt-card-title">Upcoming tickets <span className="pt-count">{upcoming.length}</span></h2>
          {loading ? <p className="pt-empty">Loading your tickets…</p> : upcoming.length === 0 ? <p className="pt-empty">No upcoming tickets. Pick a date to book one.</p> : (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead><tr><th scope="col">Date</th><th scope="col">Ticket</th><th scope="col">Queue</th><th scope="col" className="pt-num">Price</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {upcoming.map((t) => {
                    const sameDay = t.visitDate <= today
                    return (
                      <tr key={t.ticketId}>
                        <td>{formatDate(t.visitDate)}</td>
                        <td>#{t.ticketId} <span className="pt-pill">{t.status}</span></td>
                        <td>{t.hasExpress ? 'Express' : 'Standard'}</td>
                        <td className="pt-num">{money(t.ticketPrice)}</td>
                        <td className="pt-num">
                          <button type="button" className="pt-btn pt-btn-sm pt-btn-ghost" onClick={() => onRefund(t)} disabled={refundBusy === t.ticketId || sameDay} title={sameDay ? 'Refunds are only available before the visit date.' : 'Refund this ticket'}>
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
        </section>

        {past.length > 0 && (
          <details className="pt-card pt-flush pt-history">
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
      </div>
    </div>
  )
}

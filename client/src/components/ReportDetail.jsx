import { useEffect, useRef } from 'react'
import DataTable from './DataTable.jsx'
import './DetailTotals.css'

const money = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Totals worked out by ONE SQL statement over ALL the matching rows (not just the 20 listed).
// A total that names a report column (`match`) is compared with the number that was clicked, so a mismatch shows.
function DetailTotals({ totals, clicked }) {
  return (
    <div className="rd-totals">
      <strong>Total, all matching rows</strong>
      <ul>
        {totals.map((t) => {
          const value = Number(t.value)
          const reported = t.match ? Number(clicked[t.match]) : NaN
          const known = Number.isFinite(reported)
          const same = known && Math.abs(reported - value) < 0.005
          const fmt = (n) => (t.money ? money(n) : n.toLocaleString('en-US'))
          return (
            <li key={t.label}>
              {t.label}: <strong>{fmt(value)}</strong>
              {known && (same ? <span className="rd-ok"> ✓ matches the report</span> : <span className="rd-bad"> ✗ the report says {fmt(reported)}</span>)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// The tables and matching rows behind one report line. `state` is { key, title, loading, error, data }.
// Quick view: the totals and the first few rows only. When there are more, "View all" opens the searchable pop-up (onViewAll).
// rowAction(row) is passed straight to the rows' DataTable (the Edit button; see DataTable.jsx).
export default function ReportDetail({ state, onClose, onViewAll, rowAction }) {
  const ref = useRef(null)
  const data = state.data
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [state.key])

  const from = data?.sources?.map((s) => s.table).join(', ')
  const total = Number(data?.total)
  // The row that was clicked (state.key is its JSON). A total can name the column it must equal.
  let clicked
  try {
    clicked = JSON.parse(state.key) ?? {}
  } catch {
    clicked = {}
  }
  const listed = data?.rows?.length ?? 0
  const hasMore = Number.isFinite(total) && total > listed
  const countLine =
    data && Number.isFinite(total)
      ? hasMore
        ? `Showing the first ${listed.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} matching rows.`
        : `${total.toLocaleString('en-US')} matching rows.`
      : ''

  return (
    <section className="rd-panel" ref={ref} aria-live="polite" aria-label={state.title || 'Row details'}>
      <div className="rd-head">
        <p className="rd-title">{state.title}</p>
        <button type="button" className="dt-toggle" onClick={onClose}>
          Close
        </button>
      </div>
      {state.loading && <p className="muted">Loading the matching rows…</p>}
      {state.error && <p className="rd-error">{state.error}</p>}
      {data && (
        <>
          {from && (
            <p className="rd-from" title={data.sources.map((s) => `${s.table}: ${s.note}`).join(' ')}>
              From {from}
            </p>
          )}
          {(data.label && data.label !== 'Source tables') || countLine ? (
            <p className="rd-label">
              {data.label && data.label !== 'Source tables' ? data.label : ''}
              {data.label && data.label !== 'Source tables' && countLine ? '. ' : ''}
              {countLine}
            </p>
          ) : null}
          {data.note && <p className="muted">{data.note}</p>}
          {data.totals?.length > 0 && <DetailTotals totals={data.totals} clicked={clicked} />}
          {data.rows?.length > 0 && <DataTable rows={data.rows} rowAction={rowAction} />}
          {hasMore && onViewAll && (
            <p className="rd-viewall">
              <button type="button" className="dt-toggle rd-viewall-btn" onClick={onViewAll}>
                View all {total.toLocaleString('en-US')} rows
              </button>
              <span className="muted"> Opens a pop-up where you can search them.</span>
            </p>
          )}
        </>
      )}
    </section>
  )
}

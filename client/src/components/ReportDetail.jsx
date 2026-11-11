import { useEffect, useRef } from 'react'
import DataTable from './DataTable.jsx'

// The tables and matching rows behind one report line. `state` is { key, title, loading, error, data }.
// Quick view: the totals and the first few rows only. When there are more, "View all" opens the searchable pop-up (onViewAll).
// rowAction(row) is passed straight to the rows' DataTable (the Edit button; see DataTable.jsx).
export default function ReportDetail({ state, onClose, onViewAll, rowAction }) {
  const ref = useRef(null)
  const data = state.data
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [state.key])

  const total = Number(data?.total)
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
          {(data.label && data.label !== 'Source tables') || countLine ? (
            <p className="rd-label">
              {data.label && data.label !== 'Source tables' ? data.label : ''}
              {data.label && data.label !== 'Source tables' && countLine ? '. ' : ''}
              {countLine}
            </p>
          ) : null}
          {data.note && <p className="muted">{data.note}</p>}
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

import { useEffect, useRef } from 'react'
import DataTable from './DataTable.jsx'

// The tables and matching rows behind one report line. `state` is { key, title, loading, error, data }.
export default function ReportDetail({ state, onClose }) {
  const ref = useRef(null)
  const data = state.data
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [state.key])

  const from = data?.sources?.map((s) => s.table).join(', ')
  const total = Number(data?.total)
  const shown = Number(data?.shown ?? 0)
  const countLine =
    data && Number.isFinite(total)
      ? `Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} matching rows.`
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
          {data.rows?.length > 0 && <DataTable rows={data.rows} pageSize={10} />}
        </>
      )}
    </section>
  )
}

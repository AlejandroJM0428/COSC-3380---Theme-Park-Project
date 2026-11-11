import DataTable from './DataTable.jsx'

// The tables and matching rows behind one report line. `state` is { loading, error, data }.
export default function ReportDetail({ state, onClose }) {
  const data = state.data
  return (
    <section className="rd-panel" aria-live="polite">
      <div className="rd-head">
        <button type="button" className="dt-toggle" onClick={onClose}>
          Close
        </button>
      </div>
      {state.loading && <p className="muted">Loading the matching rows…</p>}
      {state.error && <p className="rd-error">{state.error}</p>}
      {data && (
        <>
          <ul className="rd-sources">
            {data.sources.map((s) => (
              <li key={s.table}>
                <strong>{s.table}</strong>
                <span>{s.note}</span>
              </li>
            ))}
          </ul>
          {data.label && data.label !== 'Source tables' && <p className="rd-label">{data.label}</p>}
          {data.note && <p className="muted">{data.note}</p>}
          {data.more && <p className="muted">Showing the first {data.shown.toLocaleString('en-US')} matching rows.</p>}
          {data.rows?.length > 0 && <DataTable rows={data.rows} pageSize={10} />}
        </>
      )}
    </section>
  )
}

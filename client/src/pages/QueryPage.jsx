import { useEffect, useState } from 'react'
import { listQueries, listRecords, runQuery } from '../api'
import DataTable from '../components/DataTable.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import './ReportPage.css'

export default function QueryPage() {
  const [queries, setQueries] = useState([])
  const [id, setId] = useState('')
  const [values, setValues] = useState({})
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [venues, setVenues] = useState([]) // for the venue drop-down (Q4); stays empty if the list cannot be loaded

  useEffect(() => {
    listRecords('facilities', { kind: 'Venue' })
      .then((list) => setVenues(list.filter((v) => v.Kind === 'Venue' && Number(v.IsActive) === 1)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    listQueries()
      .then((list) => {
        setQueries(list)
        if (list.length) pick(list[0])
      })
      .catch((e) => setError(e.message))
  }, [])

  function pick(q) {
    setId(q.id)
    setValues(Object.fromEntries(q.params.map((p) => [p.name, p.default])))
    setRows(null)
    setError('')
  }

  const current = queries.find((q) => q.id === id)

  async function run() {
    setBusy(true)
    setError('')
    setRows(null)
    try {
      setRows(await runQuery(id, values))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Run Queries</h1>
      <p className="muted">Each button runs a fixed SQL file against MySQL and shows the rows that come back.</p>

      <div className="tabs">
        {queries.map((q) => (
          <button key={q.id} type="button" aria-pressed={q.id === id} onClick={() => pick(q)}>
            {q.title}
          </button>
        ))}
      </div>

      {current && (
        <div className="toolbar">
          {current.params.some((p) => p.name === 'start') && current.params.some((p) => p.name === 'end') && (
            <div className="qp-field">
              <span>Dates</span>
              <DateRangePicker
                label="Dates"
                from={values.start ?? ''}
                to={values.end ?? ''}
                onChange={({ from, to }) => setValues((v) => ({ ...v, start: from || current.params.find((p) => p.name === 'start').default, end: to || current.params.find((p) => p.name === 'end').default }))}
              />
            </div>
          )}
          {current.params.filter((p) => p.name !== 'start' && p.name !== 'end').map((p) =>
            p.name === 'venue' && venues.length > 0 ? (
              <label key={p.name} className="qp-field">
                <span>Venue</span>
                <select value={values.venue ?? 0} onChange={(e) => setValues({ ...values, venue: e.target.value })}>
                  <option value={0}>All venues</option>
                  {venues.map((v) => <option key={v.ItemID} value={v.ItemID}>{v.Name}</option>)}
                </select>
              </label>
            ) : p.name === 'days' ? (
              <div key={p.name} className="qp-field">
                <span>{p.label}</span>
                <div className="qp-chips">
                  {[7, 14, 30, 60, 90].map((n) => (
                    <button key={n} type="button" aria-pressed={Number(values.days) === n} onClick={() => setValues({ ...values, days: n })}>{n} days</button>
                  ))}
                </div>
              </div>
            ) : (
              <label key={p.name} className="qp-field">
                <span>{p.label}</span>
                <input type="number" min="0" value={values[p.name] ?? ''} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} />
              </label>
            ),
          )}
          <button type="button" className="btn-primary" onClick={run} disabled={busy}>
            {busy ? 'Running...' : 'Run'}
          </button>
        </div>
      )}

      <ErrorBanner message={error} onClose={() => setError('')} />

      {rows && rows.length === 0 && <p className="page-note">The query ran and returned 0 rows.</p>}
      {rows && rows.length > 0 && (
        <>
          <p className="summary">{rows.length} row(s) from the database.</p>
          <DataTable rows={rows} pageSize={10} />
        </>
      )}
    </div>
  )
}

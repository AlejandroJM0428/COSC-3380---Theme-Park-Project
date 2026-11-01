import { useEffect, useState } from 'react'
import { listQueries, runQuery } from '../api'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

export default function QueryPage() {
  const [queries, setQueries] = useState([])
  const [id, setId] = useState('')
  const [values, setValues] = useState({})
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
          {current.params.map((p) => (
            <label key={p.name}>
              {p.label}
              <input
                type={p.type === 'date' ? 'date' : 'number'}
                value={values[p.name] ?? ''}
                onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
              />
            </label>
          ))}
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
          <DataTable rows={rows} />
        </>
      )}
    </div>
  )
}

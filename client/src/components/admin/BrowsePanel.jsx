import { useEffect, useState } from 'react'
import { adminBrowseTable, adminListTables } from '../../api'
import ErrorBanner from '../ErrorBanner.jsx'
import '../DataTable.css'

// Admin tool: browse any table or view, one page at a time. Read only.
// Sorting and paging happen on the server (Browse Table, GET /api/admin/tables/:name), so a click on a
// header sorts the whole table, not just the rows on screen. Password and hash columns show [hidden].

const SIZES = [10, 25, 50, 100, 200]
const NUMERIC = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double'])
const CELL_LIMIT = 120

function formatCell(value) {
  if (value === null || value === undefined) return <span className="muted">NULL</span>
  if (value === '[hidden]') return <span className="muted">[hidden]</span>
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (text.length > CELL_LIMIT) return <span title={text}>{text.slice(0, CELL_LIMIT)}…</span>
  return text
}

export default function BrowsePanel() {
  const [tables, setTables] = useState([])
  const [listError, setListError] = useState('')
  const [name, setName] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const [sort, setSort] = useState(null)
  const [dir, setDir] = useState('asc')
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState(null) // { key, data, error } for the last finished request

  // The list of tables and views.
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const list = await adminListTables()
        if (!alive) return
        setTables(list)
        if (list.length > 0) setName((current) => current || list[0].name)
      } catch (e) {
        if (alive) setListError(e.message)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  // One page of the chosen table. Whatever changes in `key` runs a new request; an older answer is ignored.
  const key = `${name}|${page}|${size}|${sort ?? ''}|${dir}|${reloadKey}`
  useEffect(() => {
    if (!name) return undefined
    let alive = true
    async function load() {
      try {
        const data = await adminBrowseTable(name, { page, size, sort, dir: sort ? dir : '' })
        if (alive) setResult({ key, data, error: '' })
      } catch (e) {
        if (alive) setResult({ key, data: null, error: e.message })
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [key, name, page, size, sort, dir])

  const loading = Boolean(name) && result?.key !== key
  const error = result?.key === key ? result.error : ''
  const data = result?.data && result.data.name === name ? result.data : null

  function pickTable(next) {
    setName(next)
    setPage(1)
    setSort(null)
    setDir('asc')
  }

  // First click ascending, second descending, third back to the default order.
  function toggleSort(column) {
    setPage(1)
    if (sort !== column) {
      setSort(column)
      setDir('asc')
    } else if (dir === 'asc') {
      setDir('desc')
    } else {
      setSort(null)
      setDir('asc')
    }
  }

  const baseTables = tables.filter((t) => t.type === 'table')
  const views = tables.filter((t) => t.type === 'view')
  const first = data && data.total > 0 ? (data.page - 1) * data.size + 1 : 0
  const last = data ? Math.min(data.total, data.page * data.size) : 0

  return (
    <section className="admin-panel" aria-labelledby="browse-title">
      <h3 id="browse-title">Browse Table</h3>
      <p className="muted">Read only. Click a column heading to sort the whole table. Password and hash columns are hidden.</p>

      <ErrorBanner message={listError} onClose={() => setListError('')} />

      <div className="toolbar">
        <label>
          Table or view
          <select value={name} onChange={(e) => pickTable(e.target.value)} disabled={tables.length === 0}>
            {tables.length === 0 && <option value="">{listError ? 'Could not load' : 'Loading…'}</option>}
            {baseTables.length > 0 && (
              <optgroup label="Tables">
                {baseTables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                    {t.approxRows != null ? ` (about ${Number(t.approxRows).toLocaleString('en-US')} rows)` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {views.length > 0 && (
              <optgroup label="Views">
                {views.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          Rows per page
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value))
              setPage(1)
            }}
          >
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={!name || loading}>
          Reload
        </button>
      </div>

      <ErrorBanner message={error} />

      {loading && <p className="muted">Loading…</p>}

      {data && (
        <div style={loading ? { opacity: 0.55 } : undefined}>
          <p className="summary">
            {data.name} <span className="muted">({data.type})</span>
            {' · '}
            {data.total === 0
              ? 'no rows'
              : `rows ${first.toLocaleString('en-US')} to ${last.toLocaleString('en-US')} of ${data.total.toLocaleString('en-US')}`}
          </p>

          {data.rows.length === 0 ? (
            <p className="muted">This {data.type} has no rows.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {data.columns.map((c) => {
                      const active = sort === c.name
                      const numeric = NUMERIC.has(c.type)
                      return (
                        <th
                          key={c.name}
                          className={numeric ? 'dt-num' : undefined}
                          aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        >
                          <button
                            type="button"
                            className="dt-sort"
                            onClick={() => toggleSort(c.name)}
                            disabled={c.hidden}
                            title={c.hidden ? 'Hidden column' : `${c.type}${c.nullable ? ', can be empty' : ''}. Click to sort.`}
                          >
                            {c.name}
                            <span className="dt-arrow" aria-hidden="true">
                              {active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                            </span>
                          </button>
                          {c.key && (
                            <>
                              {' '}
                              <span className="tag" title="Primary key">
                                PK
                              </span>
                            </>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <td key={c.name} className={NUMERIC.has(c.type) ? 'dt-num' : undefined}>
                          {formatCell(row[c.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="button-row" style={{ marginTop: 10, alignItems: 'center' }}>
            <button type="button" onClick={() => setPage(1)} disabled={loading || data.page <= 1}>
              First
            </button>
            <button type="button" onClick={() => setPage(data.page - 1)} disabled={loading || data.page <= 1}>
              Previous
            </button>
            <span>
              Page {data.page.toLocaleString('en-US')} of {data.pages.toLocaleString('en-US')}
            </span>
            <button type="button" onClick={() => setPage(data.page + 1)} disabled={loading || data.page >= data.pages}>
              Next
            </button>
            <button type="button" onClick={() => setPage(data.pages)} disabled={loading || data.page >= data.pages}>
              Last
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

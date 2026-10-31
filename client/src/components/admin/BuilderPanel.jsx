import { useEffect, useRef, useState } from 'react'
import { adminBrowseTable, adminBuild, adminListTables } from '../../api'
import ErrorBanner from '../ErrorBanner.jsx'
import '../DataTable.css'
import './BuilderPanel.css'

// Admin tool: SQL GUI. Pick a table, tick columns, add filters, sort and limit, then run it
// (POST /api/admin/builder). The page sends data, never SQL. The server checks every name against the
// database and runs the statement read only. The statement it built is shown after each run, and can be
// handed to the SQL console with `onUseInConsole(sql)` (the one-page admin passes that prop).

const OPS = ['=', '!=', '<', '<=', '>', '>=', 'LIKE', 'NOT LIKE', 'IN', 'IS NULL', 'IS NOT NULL']
const NO_VALUE = new Set(['IS NULL', 'IS NOT NULL'])
const MAX_FILTERS = 10
const MAX_LIMIT = 500
const DEFAULT_LIMIT = '100'
const CELL_LIMIT = 120

function formatCell(value) {
  if (value === null || value === undefined) return <span className="muted">NULL</span>
  if (value === '[hidden]') return <span className="muted">[hidden]</span>
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (text.length > CELL_LIMIT) return <span title={text}>{text.slice(0, CELL_LIMIT)}…</span>
  return text
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

export default function BuilderPanel({ onUseInConsole }) {
  const [tables, setTables] = useState([])
  const [listError, setListError] = useState('')
  const [table, setTable] = useState('')
  const [columns, setColumns] = useState([]) // visible columns of the chosen table: [{ name, type }]
  const [picked, setPicked] = useState([]) // ticked column names; empty means every column
  const [filters, setFilters] = useState([]) // [{ id, column, op, value }]
  const [match, setMatch] = useState('all')
  const [sort, setSort] = useState('')
  const [dir, setDir] = useState('asc')
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const runId = useRef(0)
  const colId = useRef(0)
  const nextFilterId = useRef(1)

  // The list of tables and views.
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const list = await adminListTables()
        if (!alive) return
        setTables(list)
        if (list.length > 0) setTable((current) => current || list[0].name)
      } catch (e) {
        if (alive) setListError(e.message)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  // Columns of the chosen table. Choosing another table clears the choices that belonged to the old one.
  useEffect(() => {
    if (!table) return undefined
    let alive = true
    const id = ++colId.current
    async function load() {
      try {
        const data = await adminBrowseTable(table, { page: 1, size: 10 })
        if (!alive || id !== colId.current) return
        setColumns(data.columns.filter((c) => !c.hidden).map((c) => ({ name: c.name, type: c.type })))
      } catch (e) {
        if (alive && id === colId.current) {
          setColumns([])
          setListError(e.message)
        }
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [table])

  function pickTable(next) {
    setTable(next)
    setColumns([])
    setPicked([])
    setFilters([])
    setMatch('all')
    setSort('')
    setDir('asc')
    setLimit(DEFAULT_LIMIT)
    setResult(null)
    setError('')
  }

  function toggleColumn(name) {
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
  }

  function addFilter() {
    if (filters.length >= MAX_FILTERS || columns.length === 0) return
    setFilters((f) => [...f, { id: nextFilterId.current++, column: columns[0].name, op: '=', value: '' }])
  }

  function changeFilter(id, patch) {
    setFilters((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function removeFilter(id) {
    setFilters((f) => f.filter((x) => x.id !== id))
  }

  // Turn the form into the request the server expects. Returns { spec } or { problem }.
  function buildSpec() {
    const spec = { table }
    // Keep the table's own column order, whatever order the boxes were ticked in.
    const chosen = columns.filter((c) => picked.includes(c.name)).map((c) => c.name)
    if (chosen.length > 0) spec.columns = chosen

    const list = []
    for (const [i, f] of filters.entries()) {
      if (NO_VALUE.has(f.op)) {
        list.push({ column: f.column, op: f.op })
      } else if (f.op === 'IN') {
        const values = f.value
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '')
        if (values.length === 0) return { problem: `Filter ${i + 1}: type one or more values, separated by commas.` }
        if (values.length > 50) return { problem: `Filter ${i + 1}: use 50 values or fewer.` }
        list.push({ column: f.column, op: f.op, value: values })
      } else {
        if (f.value === '') return { problem: `Filter ${i + 1}: type a value, or choose IS NULL.` }
        list.push({ column: f.column, op: f.op, value: f.value })
      }
    }
    if (list.length > 0) {
      spec.filters = list
      if (list.length > 1) spec.match = match
    }

    if (sort) {
      spec.sort = sort
      spec.dir = dir
    }

    const n = Number(limit)
    if (limit.trim() === '' || !Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return { problem: `Limit must be a whole number from 1 to ${MAX_LIMIT}.` }
    }
    spec.limit = n
    return { spec }
  }

  async function run() {
    if (busy || !table) return
    const { spec, problem } = buildSpec()
    if (problem) {
      setError(problem)
      return
    }
    const id = ++runId.current
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const out = await adminBuild(spec)
      if (id === runId.current) setResult(out)
    } catch (e) {
      if (id === runId.current) setError(e.message)
    } finally {
      if (id === runId.current) setBusy(false)
    }
  }

  const baseTables = tables.filter((t) => t.type === 'table')
  const views = tables.filter((t) => t.type === 'view')
  const numeric = new Set()
  if (result?.rows?.length) {
    // Right-align a column when every value shown in it is a number (or empty).
    result.columns.forEach((_, i) => {
      if (result.rows.every((r) => r[i] === null || typeof r[i] === 'number')) numeric.add(i)
    })
  }

  return (
    <section className="admin-panel" aria-labelledby="builder-title">
      <h3 id="builder-title">SQL GUI</h3>
      <p className="muted">
        Build a read-only query without typing SQL. Leave all columns unticked to show every column. Password and hash
        columns are not offered.
      </p>

      <ErrorBanner message={listError} onClose={() => setListError('')} />

      <div className="toolbar">
        <label>
          Table or view
          <select value={table} onChange={(e) => pickTable(e.target.value)} disabled={tables.length === 0}>
            {tables.length === 0 && <option value="">{listError ? 'Could not load' : 'Loading…'}</option>}
            {baseTables.length > 0 && (
              <optgroup label="Tables">
                {baseTables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
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
      </div>

      {columns.length > 0 && (
        <>
          <fieldset className="builder-columns">
            <legend>Columns to show</legend>
            {columns.map((c) => (
              <label key={c.name} className="builder-check">
                <input type="checkbox" checked={picked.includes(c.name)} onChange={() => toggleColumn(c.name)} />
                {c.name}
              </label>
            ))}
            {picked.length > 0 && (
              <button type="button" onClick={() => setPicked([])}>
                Show every column
              </button>
            )}
          </fieldset>

          <fieldset className="builder-filters">
            <legend>Filters</legend>
            {filters.length === 0 && <p className="muted">No filters. Every row of the table is eligible.</p>}
            {filters.length > 1 && (
              <label>
                Keep a row when{' '}
                <select value={match} onChange={(e) => setMatch(e.target.value)}>
                  <option value="all">all filters match</option>
                  <option value="any">any filter matches</option>
                </select>
              </label>
            )}
            {filters.map((f, i) => (
              <div className="toolbar" key={f.id}>
                <label>
                  Column
                  <select
                    aria-label={`Filter ${i + 1} column`}
                    value={f.column}
                    onChange={(e) => changeFilter(f.id, { column: e.target.value })}
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Is
                  <select
                    aria-label={`Filter ${i + 1} operator`}
                    value={f.op}
                    onChange={(e) => changeFilter(f.id, { op: e.target.value })}
                  >
                    {OPS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </label>
                {!NO_VALUE.has(f.op) && (
                  <label>
                    {f.op === 'IN' ? 'Values (commas)' : 'Value'}
                    <input
                      aria-label={`Filter ${i + 1} value`}
                      type="text"
                      value={f.value}
                      maxLength={500}
                      onChange={(e) => changeFilter(f.id, { value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') run()
                      }}
                    />
                  </label>
                )}
                <button type="button" onClick={() => removeFilter(f.id)} aria-label={`Remove filter ${i + 1}`}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addFilter} disabled={filters.length >= MAX_FILTERS}>
              Add filter
            </button>
            {filters.length >= MAX_FILTERS && <span className="muted"> Up to {MAX_FILTERS} filters.</span>}
          </fieldset>

          <div className="toolbar">
            <label>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="">Default order</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select value={dir} onChange={(e) => setDir(e.target.value)} disabled={!sort}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
            <label>
              Limit (1 to {MAX_LIMIT})
              <input
                type="number"
                min="1"
                max={MAX_LIMIT}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </label>
            <button type="button" className="btn-primary" onClick={run} disabled={busy || !table}>
              {busy ? 'Running…' : 'Run query'}
            </button>
          </div>
        </>
      )}

      <ErrorBanner message={error} onClose={() => setError('')} />

      {result && (
        <div>
          <p className="summary">
            {plural(result.rowCount, 'row')} returned in {result.ms} ms
            <span className="muted">
              {' '}
              ({result.table}, {result.type})
            </span>
          </p>
          <pre className="builder-sql">{result.sql}</pre>
          {typeof onUseInConsole === 'function' && (
            <div className="button-row">
              <button type="button" onClick={() => onUseInConsole(result.sql)}>
                Use in SQL console
              </button>
            </div>
          )}
          {result.truncated && (
            <p className="page-note">Only the first {result.rows.length.toLocaleString('en-US')} rows are shown.</p>
          )}
          {result.rows.length === 0 ? (
            <p className="muted">No rows.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {result.columns.map((c, i) => (
                      <th key={i} className={numeric.has(i) ? 'dt-num' : undefined}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((v, i) => (
                        <td key={i} className={numeric.has(i) ? 'dt-num' : undefined}>
                          {formatCell(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

import { useRef, useState } from 'react'
import { adminRunSql } from '../../api'
import ErrorBanner from '../ErrorBanner.jsx'
import '../DataTable.css'

// Admin tool: SQL console. One statement per run (POST /api/admin/sql).
// Read mode is the default: MySQL itself refuses any change, nothing is kept. Write mode needs the box ticked
// AND the word WRITE typed for every run; the server logs each write in the audit table, and triggers and
// constraints still apply.
//
// The statement text lives inside the panel unless the page passes `sql` and `onSqlChange`. Passing them lets
// another panel (the SQL GUI) hand a statement to this one.

const MAX_SQL = 5000
const CELL_LIMIT = 120
const DEFAULT_SQL = 'SELECT COUNT(*) AS customers FROM Customer'

function formatCell(value) {
  if (value === null || value === undefined) return <span className="muted">NULL</span>
  if (value === '[hidden]') return <span className="muted">[hidden]</span>
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (text.length > CELL_LIMIT) return <span title={text}>{text.slice(0, CELL_LIMIT)}…</span>
  return text
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

export default function SqlConsolePanel({ sql, onSqlChange }) {
  const [ownSql, setOwnSql] = useState(DEFAULT_SQL)
  const controlled = sql !== undefined && typeof onSqlChange === 'function'
  const text = controlled ? sql : ownSql
  const setText = controlled ? onSqlChange : setOwnSql

  const [write, setWrite] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const runId = useRef(0)

  const needsConfirm = write && confirm !== 'WRITE'
  const canRun = !busy && text.trim().length > 0 && !needsConfirm

  async function run() {
    if (!canRun) return
    const id = ++runId.current
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const out = await adminRunSql(text, { write, confirm })
      if (id === runId.current) setResult(out)
    } catch (e) {
      if (id === runId.current) setError(e.message)
    } finally {
      if (id === runId.current) {
        setBusy(false)
        if (write) setConfirm('') // every write is confirmed again
      }
    }
  }

  function toggleWrite(on) {
    setWrite(on)
    setConfirm('')
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  }

  const numeric = new Set()
  if (result?.kind === 'rows') {
    result.columns.forEach((_, i) => {
      const firstFilled = result.rows.find((r) => r[i] !== null && r[i] !== undefined)
      if (firstFilled && typeof firstFilled[i] === 'number') numeric.add(i)
    })
  }

  return (
    <section className="admin-panel" aria-labelledby="console-title">
      <h3 id="console-title">SQL Console</h3>
      <p className="muted">
        One statement at a time. Read-only mode runs SELECT, SHOW, DESCRIBE, EXPLAIN and WITH, stops after 5 seconds and
        shows at most 500 rows.
      </p>

      <label>
        Statement
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_SQL}
          spellCheck={false}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', resize: 'vertical' }}
        />
      </label>
      <p className="muted" style={{ margin: '4px 0 12px' }}>
        {text.length.toLocaleString('en-US')} of {MAX_SQL.toLocaleString('en-US')} characters · Ctrl+Enter runs it
      </p>

      <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={write} onChange={(e) => toggleWrite(e.target.checked)} />
        Write mode
      </label>

      {write && (
        <div className="page-note" style={{ margin: '10px 0' }}>
          <strong>Write mode changes real data.</strong> The change is kept as soon as it runs. Triggers and constraints
          still apply, and the statement is recorded in the audit log. Type WRITE to confirm each run.
        </div>
      )}

      <div className="toolbar">
        {write && (
          <label>
            Type WRITE to confirm
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="WRITE"
            />
          </label>
        )}
        <button type="button" className={write ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={!canRun}>
          {busy ? 'Running…' : write ? 'Run write' : 'Run read-only'}
        </button>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {result?.kind === 'rows' && (
        <div>
          <p className="summary">
            {plural(result.rowCount, 'row')} returned in {result.ms} ms
            <span className="muted"> ({result.mode} mode)</span>
          </p>
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

      {result?.kind === 'write' && (
        <div>
          <p className="summary">
            Done in {result.ms} ms
            <span className="muted"> ({result.mode} mode)</span>
          </p>
          <ul>
            <li>{plural(result.affectedRows, 'row')} affected</li>
            <li>{plural(result.changedRows, 'row')} changed</li>
            {result.insertId != null && <li>New ID: {result.insertId}</li>}
            {result.info && <li>{result.info}</li>}
          </ul>
        </div>
      )}
    </section>
  )
}

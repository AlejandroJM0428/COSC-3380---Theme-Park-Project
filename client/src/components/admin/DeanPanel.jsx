import { useEffect, useState } from 'react'
import {
  adminAudit,
  adminBrowseTable,
  adminDeleteRow,
  adminInsertRow,
  adminListTables,
  adminUpdateRow,
} from '../../api'
import ErrorBanner from '../ErrorBanner.jsx'
import '../DataTable.css'
import './DeanPanel.css'

// Admin tool: dean mode. Add, edit or delete one row in any table (POST and PUT /api/admin/rows/:table,
// POST /api/admin/rows/:table/delete). These are ordinary INSERT, UPDATE and DELETE statements, so triggers and
// constraints still apply: a broken rule comes back as the rule's own message and nothing is kept. Every change is
// written to the audit log. Views, the audit table and tables without a primary key cannot be edited here.
// Primary key values are shown but not editable; password and hash columns are protected.

const SIZE = 25
const NUMERIC = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double'])
const LONG_TEXT = new Set(['text', 'mediumtext', 'longtext'])
const CELL_LIMIT = 120

function formatCell(value) {
  if (value === null || value === undefined) return <span className="muted">NULL</span>
  if (value === '[hidden]') return <span className="muted">[hidden]</span>
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (text.length > CELL_LIMIT) return <span title={text}>{text.slice(0, CELL_LIMIT)}…</span>
  return text
}

const keyText = (key) =>
  Object.entries(key ?? {})
    .map(([n, v]) => `${n} = ${v}`)
    .join(', ')

const isEditable = (col) => !col.hidden && !col.generated

export default function DeanPanel() {
  const [tables, setTables] = useState([])
  const [listError, setListError] = useState('')
  const [name, setName] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(null)
  const [dir, setDir] = useState('asc')
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState(null) // { key, data, error } for the last finished page request

  const [form, setForm] = useState(null) // { mode: 'insert' | 'edit' | 'delete', row, values, nulls }
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const [auditKey, setAuditKey] = useState(0)
  const [auditLog, setAuditLog] = useState({ rows: [], error: '' })

  // Tables only: views, and the audit log itself, cannot be edited.
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const list = await adminListTables()
        if (!alive) return
        const usable = list.filter((t) => t.type === 'table' && t.name.toLowerCase() !== 'adminaudit')
        setTables(usable)
        if (usable.length > 0) setName((current) => current || usable[0].name)
      } catch (e) {
        if (alive) setListError(e.message)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  const key = `${name}|${page}|${sort ?? ''}|${dir}|${reloadKey}`
  useEffect(() => {
    if (!name) return undefined
    let alive = true
    async function load() {
      try {
        const data = await adminBrowseTable(name, { page, size: SIZE, sort, dir: sort ? dir : '' })
        if (alive) setResult({ key, data, error: '' })
      } catch (e) {
        if (alive) setResult({ key, data: null, error: e.message })
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [key, name, page, sort, dir])

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const rows = await adminAudit({ limit: 10 })
        if (alive) setAuditLog({ rows, error: '' })
      } catch (e) {
        if (alive) setAuditLog({ rows: [], error: e.message })
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [auditKey])

  const loading = Boolean(name) && result?.key !== key
  const loadError = result?.key === key ? result.error : ''
  const data = result?.data && result.data.name === name ? result.data : null
  const canEdit = Boolean(data) && data.primaryKey.length > 0

  function pickTable(next) {
    setName(next)
    setPage(1)
    setSort(null)
    setDir('asc')
    setForm(null)
    setFormError('')
    setNotice('')
  }

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

  function openInsert() {
    setNotice('')
    setFormError('')
    setForm({ mode: 'insert', row: null, values: {}, nulls: {} })
  }

  function openEdit(row) {
    const values = {}
    const nulls = {}
    for (const c of data.columns) {
      if (c.hidden) continue
      values[c.name] = row[c.name] === null || row[c.name] === undefined ? '' : String(row[c.name])
      nulls[c.name] = row[c.name] === null
    }
    setNotice('')
    setFormError('')
    setForm({ mode: 'edit', row, values, nulls })
  }

  function openDelete(row) {
    setNotice('')
    setFormError('')
    setForm({ mode: 'delete', row, values: {}, nulls: {} })
  }

  function closeForm() {
    setForm(null)
    setFormError('')
  }

  const keyOf = (row) => Object.fromEntries(data.primaryKey.map((k) => [k, row[k]]))

  async function submit(e) {
    e.preventDefault()
    if (saving || !form || !data) return
    setFormError('')

    let call
    if (form.mode === 'delete') {
      call = () => adminDeleteRow(data.name, keyOf(form.row))
    } else {
      const values = {}
      for (const c of data.columns) {
        if (!isEditable(c)) continue
        if (form.mode === 'edit') {
          if (c.key) continue // the key picks the row; it is not edited here
          const was = form.row[c.name]
          if (form.nulls[c.name]) {
            if (was !== null) values[c.name] = null
          } else if (was === null || String(was) !== form.values[c.name]) {
            values[c.name] = form.values[c.name] ?? ''
          }
        } else if (form.nulls[c.name]) {
          values[c.name] = null
        } else if ((form.values[c.name] ?? '') !== '') {
          values[c.name] = form.values[c.name] // empty boxes are left out so the database fills them in
        }
      }
      if (Object.keys(values).length === 0) {
        setFormError(form.mode === 'edit' ? 'Nothing changed.' : 'Fill in at least one column.')
        return
      }
      call =
        form.mode === 'edit'
          ? () => adminUpdateRow(data.name, keyOf(form.row), values)
          : () => adminInsertRow(data.name, values)
    }

    setSaving(true)
    try {
      const out = await call()
      if (out.action === 'insert') {
        setNotice(`Added a row to ${out.table}${out.key ? ` (${keyText(out.key)})` : ''}. Logged in the audit log.`)
      } else if (out.action === 'update') {
        setNotice(
          out.changed.length === 0
            ? 'No change was needed, so nothing was written.'
            : `Updated ${out.changed.join(', ')} on ${keyText(out.key)}. Logged in the audit log.`,
        )
      } else {
        setNotice(`Deleted ${keyText(out.key)} from ${out.table}. Logged in the audit log.`)
      }
      setForm(null)
      setReloadKey((k) => k + 1)
      setAuditKey((k) => k + 1)
    } catch (err) {
      setFormError(err.message) // a trigger or constraint message; nothing was kept
    } finally {
      setSaving(false)
    }
  }

  function setValue(column, value) {
    setForm((f) => ({ ...f, values: { ...f.values, [column]: value } }))
  }

  function setNull(column, on) {
    setForm((f) => ({ ...f, nulls: { ...f.nulls, [column]: on } }))
  }

  function renderField(c) {
    const id = `dean-f-${c.name}`
    const locked = c.hidden || c.generated || (form.mode === 'edit' && c.key)
    const long = LONG_TEXT.has(c.type)
    const isNull = Boolean(form.nulls[c.name])
    const placeholder = c.hidden ? 'protected' : c.generated ? 'calculated' : c.auto && form.mode === 'insert' ? 'automatic' : ''
    const common = {
      id,
      value: c.hidden ? '' : (form.values[c.name] ?? ''),
      disabled: locked || isNull || saving,
      placeholder,
      onChange: (e) => setValue(c.name, e.target.value),
    }
    return (
      <div className="dean-field" key={c.name}>
        <label htmlFor={id}>
          {c.name} <span className="muted">{c.type}{c.key ? ', key' : ''}</span>
        </label>
        {long ? <textarea {...common} /> : <input type={c.type === 'date' ? 'date' : 'text'} autoComplete="off" {...common} />}
        {c.nullable && !locked && (
          <label className="dean-null">
            <input type="checkbox" checked={isNull} disabled={saving} onChange={(e) => setNull(c.name, e.target.checked)} />
            NULL (no value)
          </label>
        )}
      </div>
    )
  }

  const first = data && data.total > 0 ? (data.page - 1) * data.size + 1 : 0
  const last = data ? Math.min(data.total, data.page * data.size) : 0

  return (
    <section className="admin-panel" aria-labelledby="dean-title">
      <h3 id="dean-title">Dean mode</h3>
      <p className="page-note">
        <strong>This edits real data.</strong> Triggers and constraints still apply, so a rule that is broken stops the
        change and shows the rule&apos;s message. Every change is written to the audit log.
      </p>

      <ErrorBanner message={listError} onClose={() => setListError('')} />

      <div className="toolbar">
        <label>
          Table
          <select value={name} onChange={(e) => pickTable(e.target.value)} disabled={tables.length === 0}>
            {tables.length === 0 && <option value="">{listError ? 'Could not load' : 'Loading…'}</option>}
            {tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={openInsert} disabled={!canEdit || saving}>
          Add row
        </button>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={!name || loading}>
          Reload
        </button>
      </div>

      {notice && <p className="page-note" role="status">{notice}</p>}
      <ErrorBanner message={loadError} />

      {data && !canEdit && (
        <p className="page-note">This table has no primary key, so a single row cannot be picked out safely. It can only be read here.</p>
      )}

      {form && data && (
        <form className="dean-form" onSubmit={submit}>
          {form.mode === 'delete' ? (
            <>
              <h4>Delete from {data.name}</h4>
              <p className="dean-key">{keyText(keyOf(form.row))}</p>
              <p>
                This row is removed for good. Rows that depend on it are refused by the database, or removed with it when
                the link says CASCADE (those are not listed in the audit log). The deleted row is kept in the audit detail.
              </p>
            </>
          ) : (
            <>
              <h4>{form.mode === 'edit' ? `Edit ${data.name}` : `Add a row to ${data.name}`}</h4>
              {form.mode === 'edit' && <p className="dean-key">{keyText(keyOf(form.row))}</p>}
              <div className="dean-fields">{data.columns.map(renderField)}</div>
              <p className="muted">
                {form.mode === 'insert'
                  ? 'Empty boxes are left out so the database can fill them in (automatic numbers, defaults).'
                  : 'Only the boxes you change are saved.'}{' '}
                Calculated and protected columns cannot be set here.
              </p>
            </>
          )}
          <ErrorBanner message={formError} onClose={() => setFormError('')} />
          <div className="button-row">
            <button type="submit" className={form.mode === 'delete' ? 'btn-danger' : 'btn-primary'} disabled={saving}>
              {saving ? 'Saving…' : form.mode === 'delete' ? 'Delete row' : form.mode === 'edit' ? 'Save change' : 'Add row'}
            </button>
            <button type="button" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className="muted">Loading…</p>}

      {data && (
        <div style={loading ? { opacity: 0.55 } : undefined}>
          <p className="summary">
            {data.name}
            {' · '}
            {data.total === 0
              ? 'no rows'
              : `rows ${first.toLocaleString('en-US')} to ${last.toLocaleString('en-US')} of ${data.total.toLocaleString('en-US')}`}
          </p>

          {data.rows.length === 0 ? (
            <p className="muted">This table has no rows.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {canEdit && <th>Actions</th>}
                    {data.columns.map((c) => {
                      const active = sort === c.name
                      return (
                        <th
                          key={c.name}
                          className={NUMERIC.has(c.type) ? 'dt-num' : undefined}
                          aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        >
                          <button type="button" className="dt-sort" onClick={() => toggleSort(c.name)} disabled={c.hidden}>
                            {c.name}
                            <span className="dt-arrow" aria-hidden="true">
                              {active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                            </span>
                          </button>
                          {c.key && (
                            <>
                              {' '}
                              <span className="tag" title="Primary key">PK</span>
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
                      {canEdit && (
                        <td className="dean-actions">
                          <button type="button" onClick={() => openEdit(row)} disabled={saving}>
                            Edit
                          </button>
                          <button type="button" className="btn-danger" onClick={() => openDelete(row)} disabled={saving}>
                            Delete
                          </button>
                        </td>
                      )}
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

      <details className="dean-log">
        <summary>Recent audit log (last 10 changes)</summary>
        <ErrorBanner message={auditLog.error} />
        {auditLog.rows.length === 0 && !auditLog.error ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          auditLog.rows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Table</th>
                    <th>Row</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.rows.map((r) => (
                    <tr key={r.AuditID}>
                      <td>{formatCell(r.AuditTime)}</td>
                      <td>{formatCell(r.Username)}</td>
                      <td>{formatCell(r.Action)}</td>
                      <td>{formatCell(r.TableName)}</td>
                      <td>{formatCell(r.RowKey)}</td>
                      <td>{formatCell(r.Detail)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </details>
    </section>
  )
}

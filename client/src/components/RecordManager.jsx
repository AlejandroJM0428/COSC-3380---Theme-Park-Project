import { useEffect, useState } from 'react'
import { createRecord, deleteRecord, getLookups, getRecord, listRecords, updateRecord } from '../api'
import { useAuth } from '../auth/context.js'
import ErrorBanner from './ErrorBanner.jsx'
import './RecordManager.css'

// A table of records plus an add / edit / delete form, all driven by one config object
// (see config/entities.js). Database trigger messages show in the red banner.
export default function RecordManager({ entity }) {
  const { user } = useAuth()
  const canDelete = entity.deleteRoles.includes(user?.role)

  const [filters, setFilters] = useState(() => Object.fromEntries((entity.filters ?? []).map((f) => [f.key, ''])))
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(null) // null = form closed
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    getLookups(entity.resource)
      .then((data) => alive && setLookups(data))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [entity.resource])

  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    let alive = true
    listRecords(entity.resource, JSON.parse(filterKey))
      .then((data) => alive && setRows(data))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [entity.resource, filterKey, reload])

  function openAdd() {
    setError('')
    setNotice('')
    setEditingId(null)
    setForm(entity.blank())
  }

  async function openEdit(row) {
    setError('')
    setNotice('')
    try {
      const full = await getRecord(entity.resource, row[entity.idKey]) // the list has no crew, the single record does
      setEditingId(row[entity.idKey])
      setForm(entity.fromRecord(full))
    } catch (err) {
      setError(err.message)
    }
  }

  function closeForm() {
    setForm(null)
    setEditingId(null)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const body = entity.toPayload(form)
      const saved = editingId == null ? await createRecord(entity.resource, body) : await updateRecord(entity.resource, editingId, body)
      setNotice(`${entity.noun[0].toUpperCase()}${entity.noun.slice(1)} #${saved[entity.idKey]} saved.`)
      closeForm()
      setReload((n) => n + 1)
    } catch (err) {
      setError(err.message) // the trigger's own text, for example "Repair cost is required to close a maintenance job"
    } finally {
      setSaving(false)
    }
  }

  // Optional entity settings: deleteLabel ('Void'), deletePast ('Voided'), askReason (prompt sent as ?reason=),
  // canEditRow(row) and canDeleteRow(row) to hide the buttons on rows that are already finished.
  const deleteLabel = entity.deleteLabel ?? 'Delete'
  const deletePast = entity.deletePast ?? 'Deleted'

  async function remove(row) {
    let query = {}
    if (entity.askReason) {
      const reason = window.prompt(`${deleteLabel} ${entity.describe(row)}? Enter a reason (optional):`)
      if (reason === null) return // pressed Cancel
      query = { reason: reason.trim() }
    } else if (!window.confirm(`${deleteLabel} ${entity.describe(row)}? ${entity.deleteNote ?? 'This cannot be undone.'}`)) {
      return
    }
    setError('')
    setNotice('')
    try {
      await deleteRecord(entity.resource, row[entity.idKey], query)
      setNotice(`${deletePast} ${entity.describe(row)}.`)
      setReload((n) => n + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  function renderField(field) {
    const value = form[field.key]
    const options = field.optionsFrom ? field.optionsFrom(form, lookups) : (field.options ?? [])
    const id = `f-${field.key}`

    if (field.type === 'multicheck') {
      return (
        <fieldset key={field.key} className={`rm-field rm-check-group ${field.wide ? 'rm-wide' : ''}`}>
          <legend>{field.label}</legend>
          {options.length === 0 && <span className="muted">None available.</span>}
          {options.map(([v, label]) => (
            <label key={v} className="rm-check">
              <input
                type="checkbox"
                checked={value.includes(v)}
                onChange={(e) => set(field.key, e.target.checked ? [...value, v] : value.filter((x) => x !== v))}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )
    }

    let input
    if (field.type === 'select') {
      input = (
        <select id={id} value={value} required={field.required} onChange={(e) => set(field.key, e.target.value)}>
          {field.required && value === '' && <option value="">— choose —</option>}
          {options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      )
    } else {
      const type = field.type === 'datetime' ? 'datetime-local' : field.type
      input = (
        <input
          id={id}
          type={type}
          value={value}
          required={field.required}
          maxLength={field.maxLength}
          min={field.min}
          step={field.step}
          onChange={(e) => set(field.key, e.target.value)}
        />
      )
    }
    return (
      <label key={field.key} htmlFor={id} className={`rm-field ${field.wide ? 'rm-wide' : ''}`}>
        {field.label}
        {input}
      </label>
    )
  }

  // Picking another kind (ride/game/venue) clears the chosen item, because the lists differ.
  const kindFieldKey = 'facilityKind'
  function onFormChange(e) {
    if (e.target.id === `f-${kindFieldKey}`) setForm((f) => ({ ...f, facilityId: '' }))
  }

  return (
    <div className="rm">
      <h1>{entity.title}</h1>
      <p className="muted">{entity.intro}</p>

      <ErrorBanner message={error} onClose={() => setError('')} />
      {notice && <p className="result allowed">{notice}</p>}

      <div className="rm-toolbar">
        <button type="button" className="btn-primary" onClick={openAdd} disabled={form !== null}>
          + Add {entity.noun}
        </button>
        {(entity.filters ?? []).map((f) => (
          <label key={f.key} className="rm-filter">
            {f.label}
            <select value={filters[f.key]} onChange={(e) => setFilters((cur) => ({ ...cur, [f.key]: e.target.value }))}>
              {f.options.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {form && (
        <form className="panel rm-form" onSubmit={submit} onChange={onFormChange}>
          <h2>{editingId == null ? `Add ${entity.noun}` : `Edit ${entity.noun} #${editingId}`}</h2>
          <div className="rm-grid">{entity.fields.map(renderField)}</div>
          <div className="button-row">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {entity.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[entity.idKey]}>
                  {entity.columns.map((c) => (
                    <td key={c.key}>{c.format ? c.format(row[c.key], row) : (row[c.key] ?? '—')}</td>
                  ))}
                  <td className="rm-actions">
                    {(entity.canEditRow?.(row) ?? true) && (
                      <button type="button" onClick={() => openEdit(row)} disabled={form !== null}>
                        Edit
                      </button>
                    )}
                    {canDelete && (entity.canDeleteRow?.(row) ?? true) && (
                      <button type="button" className="rm-danger" onClick={() => remove(row)} disabled={form !== null}>
                        {deleteLabel}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

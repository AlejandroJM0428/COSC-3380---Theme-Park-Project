import { useEffect, useState } from 'react'
import { createRecord, deleteRecord, reactivateRecord, getLookups, getRecord, listRecords, updateRecord } from '../api'
import { useAuth } from '../auth/context.js'
import ErrorBanner from './ErrorBanner.jsx'
import LookupField from './LookupField.jsx'
import DateTimeField from './DateTimeField.jsx'
import ReasonDialog from './ReasonDialog.jsx'
import './RecordManager.css'

// A table of records plus an add / edit / delete form, all driven by one config object
// (see config/entities.js). Database trigger messages show in the red banner.
export default function RecordManager({ entity }) {
  const { user } = useAuth()
  const canDelete = entity.deleteRoles.includes(user?.role)
  const canWrite = !entity.writeRoles || entity.writeRoles.includes(user?.role) // false = view only
  const canEdit = canWrite && (!entity.editRoles || entity.editRoles.includes(user?.role)) // editRoles: only these roles get the Edit button (they must match the PUT route)

  const [filters, setFilters] = useState(() => Object.fromEntries((entity.filters ?? []).map((f) => [f.key, ''])))
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(null) // null = form closed
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState(null)
  const [asking, setAsking] = useState(null) // { row, action: 'deactivate' | 'reactivate' } while the reason dialog is open
  const [askBusy, setAskBusy] = useState(false)
  const [askError, setAskError] = useState('')
  const [grouped, setGrouped] = useState(Boolean(entity.groupBy?.defaultOn)) // entity.groupBy: show the rows under a heading per group (groupBy.defaultOn starts it on)

  useEffect(() => {
    let alive = true
    getLookups(entity.resource)
      .then((data) => alive && setLookups(data))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [entity.resource])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

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

  function openAddLogin(row) {
    setError('')
    setNotice('')
    setEditingId(null)
    setForm(entity.addLoginForm(row, lookups))
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
    const missing = entity.fields.find((f) => f.type === 'lookup' && f.required && !form[f.key] && (!f.show || f.show(form)))
    if (missing) {
      setError(`Choose the ${missing.pickLabel ?? missing.label.toLowerCase()} first.`)
      return
    }
    setSaving(true)
    try {
      const body = entity.toPayload(form)
      const saved = editingId == null ? await createRecord(entity.resource, body) : await updateRecord(entity.resource, editingId, body)
      const label = `${entity.noun[0].toUpperCase()}${entity.noun.slice(1)}`
      setNotice(entity.hideIds ? `${label} saved.` : `${label} #${saved[entity.idKey]} saved.`)
      const nextToast = entity.savedToast?.(saved)
      if (nextToast) setToast(nextToast)
      closeForm()
      setReload((n) => n + 1)
    } catch (err) {
      const nextToast = entity.rejectToast?.(err.message)
      if (nextToast) setToast(nextToast)
      else setError(err.message) // the trigger's own text, for example "Park is at capacity for that date"
    } finally {
      setSaving(false)
    }
  }

  // Optional entity settings: lockedNote (why Edit is turned off, shown under the intro), hideIds (never show record numbers), deleteLabel ('Void'), deletePast ('Voided'), askReason (prompt sent as ?reason=),
  // canEditRow(row) and canDeleteRow(row) to hide the buttons on rows that are already finished.
  const deleteLabel = entity.deleteLabel ?? 'Delete'
  const deletePast = entity.deletePast ?? 'Deleted'

  async function remove(row) {
    if (entity.requireReason) {
      setAskError('')
      setAsking({ row, action: 'deactivate' })
      return
    }
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

  // Optional: reactivateLabel ('Reactivate') plus canReactivateRow(row) puts a deactivated row back on with one click.
  async function reactivate(row) {
    if (entity.requireReason) {
      setAskError('')
      setAsking({ row, action: 'reactivate' })
      return
    }
    setError('')
    setNotice('')
    try {
      await reactivateRecord(entity.resource, row[entity.idKey])
      setNotice(`Reactivated ${entity.describe(row)}.`)
      setReload((n) => n + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  // The reason dialog's Confirm: send the change together with the reason, then close the dialog.
  async function confirmReason(reason) {
    const { row, action } = asking
    setAskBusy(true)
    setAskError('')
    try {
      if (action === 'deactivate') {
        await deleteRecord(entity.resource, row[entity.idKey], { reason })
        setNotice(`${deletePast} ${entity.describe(row)}. Reason: ${reason}`)
      } else {
        await reactivateRecord(entity.resource, row[entity.idKey], reason)
        setNotice(`Reactivated ${entity.describe(row)}. Reason: ${reason}`)
      }
      setAsking(null)
      setReload((n) => n + 1)
    } catch (err) {
      setAskError(err.message)
    } finally {
      setAskBusy(false)
    }
  }

  // An entity may add `onFieldChange(key, value, form, lookups)` to fill other fields when one changes (it returns the extra values, or null).
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value, ...(entity.onFieldChange?.(key, value, f, lookups) ?? {}) }))

  function renderField(field) {
    if (field.show && !field.show(form)) return null
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
    if (field.type === 'lookup') {
      // Pick a guest, ticket or membership by what a person knows. The form keeps the ID, nobody sees or types it.
      return (
        <div key={field.key} className={`rm-field ${field.wide ?? true ? 'rm-wide' : ''}`}>
          <span id={`${id}-label`}>{field.label}</span>
          <LookupField
            id={id}
            kind={field.kind}
            value={value}
            required={field.required}
            forCustomer={field.forCustomerKey ? form[field.forCustomerKey] : undefined}
            needsLogin={field.needsLogin}
            onChange={(v) => set(field.key, v)}
          />
        </div>
      )
    }
    if (field.type === 'whenNow') {
      // "Now" (empty, the server stamps the time) or a picked date and time. Opens on Now, so nobody touches the calendar.
      const picked = (value ?? '') !== ''
      const stamp = () => {
        const d = new Date()
        const p = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
      }
      return (
        <div key={field.key} className="rm-field rm-wide">
          <span id={`${id}-label`}>{field.label}</span>
          <div className="rm-when" role="group" aria-labelledby={`${id}-label`}>
            <button type="button" className={picked ? '' : 'rm-when-on'} aria-pressed={!picked} onClick={() => set(field.key, '')}>
              Now
            </button>
            <button type="button" className={picked ? 'rm-when-on' : ''} aria-pressed={picked} onClick={() => !picked && set(field.key, stamp())}>
              Pick a time
            </button>
            {picked && <DateTimeField id={id} value={value} onChange={(v) => set(field.key, v)} required />}
          </div>
        </div>
      )
    }
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
    } else if (field.type === 'datetime') {
      // Date and time in two quick clicks (see DateTimeField), instead of the browser's clunky date-time box.
      return (
        <div key={field.key} className={`rm-field ${field.wide ? 'rm-wide' : ''}`}>
          <span id={`${id}-label`}>{field.label}</span>
          <DateTimeField id={id} value={value} onChange={(v) => set(field.key, v)} required={field.required} />
        </div>
      )
    } else {
      const type = field.type
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

  // Grouped view: one heading row per group (for example per role), in the order the entity lists, with the group size.
  function buildGroups(list) {
    const by = new Map()
    for (const row of list) {
      const key = row[entity.groupBy.key] ?? ''
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(row)
    }
    const order = entity.groupBy.order ?? []
    const known = order.filter((k) => by.has(k))
    const others = [...by.keys()].filter((k) => !order.includes(k)).sort()
    return [...known, ...others].map((k) => ({ key: k, rows: by.get(k) }))
  }
  const groupName = (key) => entity.groupBy.labels?.[key] ?? String(key || 'Other').replace(/([a-z])([A-Z])/g, '$1 $2')

  function renderRow(row) {
    return (
      <tr key={row[entity.rowKey ?? entity.idKey]}>
        {entity.columns.map((c) => (
          <td key={c.key}>{c.format ? c.format(row[c.key], row) : (row[c.key] ?? '—')}</td>
        ))}
        <td className="rm-actions">
          {canWrite && entity.canAddLoginRow?.(row) && (
            <button type="button" onClick={() => openAddLogin(row)} disabled={form !== null}>
              Add login
            </button>
          )}
          {canEdit && (entity.canEditRow?.(row) ?? true) && (
            <button type="button" onClick={() => openEdit(row)} disabled={form !== null}>
              Edit
            </button>
          )}
          {canEdit && entity.canReactivateRow?.(row) && (
            <button type="button" className="rm-reactivate" onClick={() => reactivate(row)} disabled={form !== null}>
              {entity.reactivateLabel ?? 'Reactivate'}
            </button>
          )}
          {canDelete && (entity.canDeleteRow?.(row) ?? true) && (
            <button type="button" className="rm-danger" onClick={() => remove(row)} disabled={form !== null}>
              {deleteLabel}
            </button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="rm">
      <h1>{entity.title}</h1>
      <p className="muted">{entity.intro}</p>
      {!canWrite && <p className="rm-locked" role="note">View only for your role. The maintenance desk adds and changes these jobs.</p>}
      {entity.lockedNote && (
        <p className="rm-locked" role="note">
          <strong>Why there is no Edit button:</strong> {entity.lockedNote}
        </p>
      )}

      <ErrorBanner message={error} onClose={() => setError('')} />
      {notice && <p className="result allowed">{notice}</p>}

      <div className="rm-toolbar">
        {canWrite && (
          <button type="button" className="btn-primary" onClick={openAdd} disabled={form !== null}>
            + Add {entity.noun}
          </button>
        )}
        {(entity.filters ?? []).map((f) => (
          <label key={f.key} className="rm-filter">
            {f.label}
            {f.type === 'search' ? (
              <input
                type="search"
                value={filters[f.key]}
                placeholder={f.placeholder}
                maxLength={50}
                onChange={(e) => setFilters((cur) => ({ ...cur, [f.key]: e.target.value }))}
              />
            ) : (
              <select value={filters[f.key]} onChange={(e) => setFilters((cur) => ({ ...cur, [f.key]: e.target.value }))}>
                {f.options.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        {entity.groupBy && (
          <label className="rm-filter">
            {entity.groupBy.label ?? 'Group by'}
            <select value={grouped ? 'on' : ''} onChange={(e) => setGrouped(e.target.value === 'on')}>
              <option value="">None</option>
              <option value="on">{entity.groupBy.optionLabel ?? 'Group'}</option>
            </select>
          </label>
        )}
      </div>

      {form && (
        <form className="panel rm-form" onSubmit={submit} onChange={onFormChange}>
          <h2>{editingId == null ? `Add ${entity.noun}` : entity.hideIds ? `Edit ${entity.noun}` : `Edit ${entity.noun} #${editingId}`}</h2>
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

      {toast && (
        <div className={`corner-toast ${toast.bad ? 'corner-toast-bad' : ''}`} role={toast.bad ? 'alert' : 'status'}>
          <div className="corner-toast-top">
            <strong>{toast.title}</strong>
            {toast.badge && <span className="corner-badge">{toast.badge}</span>}
          </div>
          <p>{toast.message}</p>
          {toast.footnote && <p className="muted">{toast.footnote}</p>}
        </div>
      )}

      {asking && (
        <ReasonDialog
          title={`${asking.action === 'deactivate' ? deleteLabel : (entity.reactivateLabel ?? 'Reactivate')} ${entity.describe(asking.row)}?`}
          message={
            asking.action === 'deactivate'
              ? (entity.deleteNote ?? 'The record is kept.')
              : 'It will show as active again and guests can use it.'
          }
          choices={entity.reasonChoices?.[asking.action] ?? []}
          confirmLabel={asking.action === 'deactivate' ? deleteLabel : (entity.reactivateLabel ?? 'Reactivate')}
          danger={asking.action === 'deactivate'}
          busy={askBusy}
          error={askError}
          onConfirm={confirmReason}
          onCancel={() => setAsking(null)}
        />
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
              {entity.groupBy && grouped
                ? buildGroups(rows).map((g) => [
                    <tr key={`group-${g.key}`} className="rm-group">
                      <th colSpan={entity.columns.length + 1}>
                        {groupName(g.key)} ({g.rows.length})
                      </th>
                    </tr>,
                    ...g.rows.map(renderRow),
                  ])
                : rows.map(renderRow)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

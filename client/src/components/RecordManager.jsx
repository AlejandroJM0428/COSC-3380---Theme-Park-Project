import { useEffect, useState } from 'react'
import { getLookups, listRecords } from '../api'
import { useAuth } from '../auth/context.js'
import usePersistedState from '../hooks/usePersistedState.js'
import useRecordDelete from '../hooks/useRecordDelete.jsx'
import ErrorBanner from './ErrorBanner.jsx'
import RecordEditor from './RecordEditor.jsx'
import './RecordManager.css'

// A table of records plus an add / edit / delete form, all driven by one config object
// (see config/entities.js). Database trigger messages show in the red banner.
// Optional props for a page that shows something else about the same records (the weather page's park status banner):
//   refreshKey  change it and the list reloads (no remount, so an open form is kept)
//   onChanged   called after a save or delete went through
export default function RecordManager({ entity, refreshKey = 0, onChanged }) {
  const { user } = useAuth()
  const canDelete = entity.deleteRoles.includes(user?.role)
  const canWrite = !entity.writeRoles || entity.writeRoles.includes(user?.role) // false = view only
  const canEdit = canWrite && (!entity.editRoles || entity.editRoles.includes(user?.role)) // editRoles: only these roles get the Edit button (they must match the PUT route)

  const [filters, setFilters] = useState(() => Object.fromEntries((entity.filters ?? []).map((f) => [f.key, ''])))
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [reload, setReload] = useState(0)
  const [editor, setEditor] = useState(null) // null = form closed, or { mode: 'add' | 'edit', id, initial }
  const [error, setError] = useState('') // load failures
  const [notice, setNotice] = useState('')
  // What a database rule said about a save, delete or reactivate. Both stay through a refresh until closed.
  const [actionError, setActionError] = usePersistedState(`records.${entity.resource}.error`, '')
  const [toast, setToast] = usePersistedState(`records.${entity.resource}.toast`, null)
  const clearErrors = () => { setError(''); setActionError('') }
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

  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    let alive = true
    listRecords(entity.resource, JSON.parse(filterKey))
      .then((data) => alive && setRows(data))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [entity.resource, filterKey, reload, refreshKey])

  function openAdd() {
    clearErrors()
    setNotice('')
    setEditor({ mode: 'add', initial: entity.blank() })
  }

  function openAddLogin(row) {
    clearErrors()
    setNotice('')
    setEditor({ mode: 'add', initial: entity.addLoginForm(row, lookups) })
  }

  function openEdit(row) {
    clearErrors()
    setNotice('')
    setEditor({ mode: 'edit', id: row[entity.idKey] }) // RecordEditor loads the full record (the list has no crew, the single record does)
  }

  function closeForm() {
    setEditor(null)
  }

  function handleSaved(saved, savedNotice) {
    setNotice(savedNotice)
    closeForm()
    setReload((n) => n + 1)
    onChanged?.()
  }

  // Delete, void and reactivate (with their reason prompts) live in hooks/useRecordDelete.jsx.
  const { remove, reactivate, askOpenClose, deleteLabel, reasonDialog } = useRecordDelete(entity, {
    clearErrors,
    setNotice,
    setActionError,
    onReload: () => setReload((n) => n + 1),
    onDeleted: onChanged,
  })

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
    const lock = entity.rowLock?.(row, user) // a reason string: the row's Edit / Delete show greyed out with it
    return (
      <tr key={row[entity.rowKey ?? entity.idKey]}>
        {entity.columns.map((c) => (
          <td key={c.key}>{c.format ? c.format(row[c.key], row) : (row[c.key] ?? '—')}</td>
        ))}
        <td className="rm-actions">
          {canWrite && entity.canAddLoginRow?.(row) && (
            <button type="button" onClick={() => openAddLogin(row)} disabled={editor !== null}>
              Add login
            </button>
          )}
          {canEdit && (entity.canEditRow?.(row) ?? true) && (
            <button type="button" onClick={() => openEdit(row)} disabled={editor !== null || Boolean(lock)} title={lock || undefined}>
              Edit
            </button>
          )}
          {canEdit && entity.canReactivateRow?.(row) && (
            <button type="button" className="rm-reactivate" onClick={() => reactivate(row)} disabled={editor !== null}>
              {entity.reactivateLabel ?? 'Reactivate'}
            </button>
          )}
          {canEdit && entity.canCloseRow?.(row) && (
            <button type="button" className="rm-danger" onClick={() => askOpenClose(row, 'close')} disabled={editor !== null}>
              Close ride
            </button>
          )}
          {canEdit && entity.canOpenRow?.(row) && (
            <button type="button" className="rm-reactivate" onClick={() => askOpenClose(row, 'open')} disabled={editor !== null}>
              Reopen ride
            </button>
          )}
          {canDelete && (entity.canDeleteRow?.(row) ?? true) && (
            <button type="button" className="rm-danger" onClick={() => remove(row)} disabled={editor !== null || Boolean(lock)} title={lock || undefined}>
              {deleteLabel}
            </button>
          )}
          {lock && <span className="rm-lockmsg">Insufficient privileges</span>}
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
      <ErrorBanner message={actionError} onClose={() => setActionError('')} />
      {notice && <p className="result allowed">{notice}</p>}

      <div className="rm-toolbar">
        {canWrite && (
          <button type="button" className="btn-primary" onClick={openAdd} disabled={editor !== null}>
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

      {editor && (
        <RecordEditor
          key={`${editor.mode}-${editor.id ?? 'new'}`}
          entity={entity}
          mode={editor.mode}
          id={editor.id}
          initial={editor.initial}
          lookups={lookups}
          onSaved={handleSaved}
          onCancel={closeForm}
          onError={(m) => (m ? setActionError(m) : clearErrors())}
          onToast={setToast}
        />
      )}

      {toast && (
        <div className={`corner-toast ${toast.bad ? 'corner-toast-bad' : ''}`} role={toast.bad ? 'alert' : 'status'}>
          <div className="corner-toast-top">
            <strong>{toast.title}</strong>
            {toast.badge && <span className="corner-badge">{toast.badge}</span>}
            <button type="button" className="corner-toast-x" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
          </div>
          <p>{toast.message}</p>
          {toast.footnote && <p className="muted">{toast.footnote}</p>}
        </div>
      )}

      {reasonDialog}

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

import { useEffect, useState } from 'react'
import { createRecord, getRecord, updateRecord } from '../api'
import { useAuth } from '../auth/context.js'
import FormFields from './FormFields.jsx'

// The add / edit form for ONE record, driven by an entity config (config/entities.js).
//   entity, mode ('add' | 'edit')
//   id         edit only: the record to load
//   initial    add only: starting values (default entity.blank())
//   lookups    drop-down lists from getLookups(entity.resource); may still be null
//   onSaved(saved, notice)  the save went through
//   onCancel()              Cancel pressed, or the record to edit could not be loaded
//   onError(message)        a database rule's text or a missing field; '' clears the banner
//   onToast(toast)          corner toast from entity.savedToast / rejectToast; null clears it
export default function RecordEditor({ entity, mode, id, initial, lookups, onSaved, onCancel, onError, onToast }) {
  const { user } = useAuth()
  const [form, setForm] = useState(() => (mode === 'edit' ? null : (initial ?? entity.blank())))
  const [saving, setSaving] = useState(false)

  // Edit: load the single record (the list rows do not carry everything, for example the crew).
  useEffect(() => {
    if (mode !== 'edit') return undefined
    let alive = true
    getRecord(entity.resource, id)
      .then((full) => alive && setForm(entity.fromRecord(full)))
      .catch((err) => {
        if (!alive) return
        onError(err.message)
        onCancel()
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.resource, mode, id])

  // Picking another kind (ride/game/venue) clears the chosen item, because the lists differ.
  function onFormChange(e) {
    if (e.target.id === 'f-facilityKind') setForm((f) => ({ ...f, facilityId: '' }))
  }

  async function submit(e) {
    e.preventDefault()
    onError('')
    const missing = entity.fields.find((f) => f.type === 'lookup' && f.required && !form[f.key] && (!f.show || f.show(form)))
    if (missing) {
      onError(`Choose the ${missing.pickLabel ?? missing.label.toLowerCase()} first.`)
      return
    }
    setSaving(true)
    onToast?.(null)
    try {
      const body = entity.toPayload(form)
      const saved = mode === 'add' ? await createRecord(entity.resource, body) : await updateRecord(entity.resource, id, body)
      const label = `${entity.noun[0].toUpperCase()}${entity.noun.slice(1)}`
      const notice = entity.hideIds ? `${label} saved.` : `${label} #${saved[entity.idKey]} saved.`
      const nextToast = entity.savedToast?.(saved)
      if (nextToast) onToast?.(nextToast)
      onSaved(saved, notice)
    } catch (err) {
      const nextToast = entity.rejectToast?.(err.message)
      if (nextToast) onToast?.(nextToast)
      else onError(err.message) // the trigger's own text, for example "Park is at capacity for that date"
    } finally {
      setSaving(false)
    }
  }

  if (!form) return <p className="muted">Loading…</p>

  return (
    <form className="panel rm-form" onSubmit={submit} onChange={onFormChange}>
      <h2>{mode === 'add' ? `Add ${entity.noun}` : entity.hideIds ? `Edit ${entity.noun}` : `Edit ${entity.noun} #${id}`}</h2>
      <div className="rm-grid">
        <FormFields entity={entity} form={form} setForm={setForm} lookups={lookups} user={user} />
      </div>
      <div className="button-row">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

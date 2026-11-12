import { useEffect, useMemo, useRef, useState } from 'react'
import { getLookups } from '../api'
import { useAuth } from '../auth/context.js'
import { canDeleteRow } from '../config/rowEditAccess.js'
import useRecordDelete from '../hooks/useRecordDelete.jsx'
import ErrorBanner from './ErrorBanner.jsx'
import RecordEditor from './RecordEditor.jsx'
import './RecordManager.css' // the form's own styles (.rm-form, .rm-grid) live here
import './RecordEditDialog.css'

// A pop-up that edits ONE record in place, on top of whatever is open (a report page, or its "View all" pop-up).
//   entity     the config RecordEditor uses (config/entities.js, entitiesMore.js)
//   mode       'edit' (default) or 'add' (a blank form; no id, no Delete)
//   id         the record to edit
//   row        the report row that was clicked (only used to decide whether Delete is allowed)
//   onSaved(saved, notice)  the save went through. The parent decides what happens next (usually: close, refresh, show the notice).
//   onDeleted(notice)       the record was deleted (or voided). Same idea. No Delete button when this is not passed.
//   onClose()  Escape, a click outside the box, the × button, Cancel, or the record could not be loaded
// Escape and the outside click close ONLY this dialog, not the pop-up behind it. Focus goes back to the button that opened it.
export default function RecordEditDialog({ entity, mode = 'edit', id, row, onSaved, onDeleted, onClose }) {
  const { user } = useAuth()
  const [lookups, setLookups] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const opener = useRef(document.activeElement) // read once, on the first render
  const box = useRef(null)
  const closeRef = useRef(onClose)
  const doneMsg = useRef('')
  const askOpen = useRef(false)
  const cancelAskRef = useRef(() => {})

  // Delete / Void with the same prompts as the data entry page. Only the record's id is known here, so the wording uses "membership #4".
  const plain = useMemo(() => ({ ...entity, describe: (r) => `${entity.noun} #${r[entity.idKey]}` }), [entity])
  const { remove, deleteLabel, reasonDialog, cancelAsk } = useRecordDelete(plain, {
    clearErrors: () => setError(''),
    setNotice: (text) => {
      doneMsg.current = text
    },
    setActionError: (text) => setError(text),
    onReload: () => onDeleted?.(doneMsg.current), // runs after a direct delete and after a delete with a reason
  })
  askOpen.current = Boolean(reasonDialog)
  cancelAskRef.current = cancelAsk
  const showDelete = mode === 'edit' && Boolean(onDeleted) && Boolean(entity.deleteRoles?.includes(user?.role))
  const deleteAccess = canDeleteRow(entity, row ?? {}, user)

  useEffect(() => {
    closeRef.current = onClose // the key handler below always calls the latest onClose
  })

  useEffect(() => {
    let alive = true
    getLookups(entity.resource)
      .then((l) => alive && setLookups(l))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [entity.resource])

  useEffect(() => {
    const returnTo = opener.current
    box.current?.focus()
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Capture phase on window, so this runs before DetailModal's own Escape listener on document and can stop it.
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (askOpen.current) cancelAskRef.current() // the reason prompt closes first, not this dialog
        else closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !box.current) return
      const items = [...box.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = before
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [])

  return (
    <div className="red-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={box} className="red-box" role="dialog" aria-modal="true" aria-label={`${mode === 'add' ? 'Add' : 'Edit'} ${entity.noun}`} tabIndex={-1}>
        <button type="button" className="red-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <ErrorBanner message={error} onClose={() => setError('')} />
        {toast && (
          <div className={`red-toast ${toast.bad ? 'red-toast-bad' : ''}`} role={toast.bad ? 'alert' : 'status'}>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
            {toast.footnote && <p className="muted">{toast.footnote}</p>}
          </div>
        )}
        <RecordEditor
          entity={entity}
          mode={mode}
          id={id}
          lookups={lookups}
          onSaved={onSaved}
          onCancel={onClose}
          onError={(m) => setError(m || '')}
          onToast={setToast}
        />
        {showDelete && (
          <div className="red-foot">
            <button type="button" className="rm-danger" onClick={() => remove({ [entity.idKey]: id })} disabled={!deleteAccess.allowed} title={deleteAccess.allowed ? undefined : deleteAccess.reason}>
              {deleteLabel}
            </button>
          </div>
        )}
      </section>
      {reasonDialog}
    </div>
  )
}

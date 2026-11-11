import { useEffect, useRef, useState } from 'react'
import { getLookups } from '../api'
import ErrorBanner from './ErrorBanner.jsx'
import RecordEditor from './RecordEditor.jsx'
import './RecordManager.css' // the form's own styles (.rm-form, .rm-grid) live here
import './RecordEditDialog.css'

// A pop-up that edits ONE record in place, on top of whatever is open (a report page, or its "View all" pop-up).
//   entity     the config RecordEditor uses (config/entities.js, entitiesMore.js)
//   id         the record to edit
//   onSaved(saved, notice)  the save went through. The parent decides what happens next (usually: close, refresh, show the notice).
//   onClose()  Escape, a click outside the box, the × button, Cancel, or the record could not be loaded
// Escape and the outside click close ONLY this dialog, not the pop-up behind it. Focus goes back to the button that opened it.
export default function RecordEditDialog({ entity, id, onSaved, onClose }) {
  const [lookups, setLookups] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const opener = useRef(document.activeElement) // read once, on the first render
  const box = useRef(null)
  const closeRef = useRef(onClose)

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
        closeRef.current()
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
      <section ref={box} className="red-box" role="dialog" aria-modal="true" aria-label={`Edit ${entity.noun}`} tabIndex={-1}>
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
          mode="edit"
          id={id}
          lookups={lookups}
          onSaved={onSaved}
          onCancel={onClose}
          onError={(m) => setError(m || '')}
          onToast={setToast}
        />
      </section>
    </div>
  )
}

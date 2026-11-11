import { useEffect, useRef, useState } from 'react'
import './ReasonDialog.css'

// A small centered dialog that asks WHY before a change is made (for example deactivating a ride).
// Tap a ready-made reason to fill the box, or type your own. The reason is required (at least 3 characters).
//   <ReasonDialog title="Deactivate Art Car Odyssey?" message="..." choices={['Retired', ...]} confirmLabel="Deactivate"
//                 danger busy={false} error="" onConfirm={(reason) => ...} onCancel={() => ...} />
const MIN = 3
const MAX = 300

export default function ReasonDialog({ title, message, choices = [], confirmLabel = 'Confirm', danger = false, busy = false, error = '', onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const box = useRef(null)
  const clean = reason.trim()
  const ok = clean.length >= MIN

  useEffect(() => {
    box.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  function submit(e) {
    e.preventDefault()
    if (ok && !busy) onConfirm(clean)
  }

  return (
    <div className="reason-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form className="reason-dialog" role="dialog" aria-modal="true" aria-labelledby="reason-title" onSubmit={submit}>
        <h2 id="reason-title">{title}</h2>
        {message && <p className="reason-message">{message}</p>}

        {choices.length > 0 && (
          <div className="reason-choices" role="group" aria-label="Common reasons">
            {choices.map((c) => (
              <button type="button" key={c} className={clean === c ? 'reason-chip reason-chip-on' : 'reason-chip'} onClick={() => setReason(c)} disabled={busy}>
                {c}
              </button>
            ))}
          </div>
        )}

        <label className="reason-field">
          Reason (saved in the audit log)
          <textarea ref={box} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX} rows={3} disabled={busy} required />
        </label>
        <div className="reason-count" aria-hidden="true">
          {clean.length}/{MAX}
        </div>

        {error && (
          <p className="reason-error" role="alert">
            {error}
          </p>
        )}

        <div className="reason-actions">
          <button type="submit" className={danger ? 'reason-go reason-go-danger' : 'reason-go'} disabled={!ok || busy}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

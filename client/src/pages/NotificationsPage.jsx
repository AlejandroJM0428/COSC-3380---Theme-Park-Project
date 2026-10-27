import { useCallback, useEffect, useState } from 'react'
import { createNotification, dismissNotification, listNotifications } from '../api/index.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const BLANK = { severity: 'Info', title: '', message: '', expiresAt: '' }

// Promos and notices. Sold-out, weather and maintenance notices are created by database triggers;
// here staff add promos and dismiss any notice (dismiss = soft delete, the row stays in the table).
export default function NotificationsPage() {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    listNotifications()
      .then(setRows)
      .catch((err) => setError(err.message))
  }, [])
  useEffect(load, [load])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      await createNotification({ ...form, expiresAt: form.expiresAt || null })
      setForm(BLANK)
      setNotice('Promo added. It now shows on the homepage.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function dismiss(row) {
    if (!window.confirm(`Dismiss "${row.Title}"? It will stop showing on the homepage.`)) return
    setError('')
    setNotice('')
    try {
      await dismissNotification(row.NotificationID)
      setNotice('Notice dismissed.')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Promos & notices</h1>
      <p>
        Add a promo here. Sold-out, weather and maintenance notices appear on their own when the database detects them.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {notice && <p className="page-note">{notice}</p>}

      <form className="rm-form" onSubmit={submit}>
        <h2>Add a promo</h2>
        <div className="rm-grid">
          <label className="rm-field">
            Title
            <input value={form.title} onChange={set('title')} maxLength={100} required />
          </label>
          <label className="rm-field">
            Importance
            <select value={form.severity} onChange={set('severity')}>
              <option value="Info">Info</option>
              <option value="Warning">Warning</option>
              <option value="Alert">Alert</option>
            </select>
          </label>
          <label className="rm-field">
            Ends (optional, e.g. 2026-11-30 18:00)
            <input value={form.expiresAt} onChange={set('expiresAt')} placeholder="2026-11-30 18:00" />
          </label>
          <label className="rm-field rm-wide">
            Message
            <input value={form.message} onChange={set('message')} maxLength={255} required />
          </label>
        </div>
        <div>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add promo'}
          </button>
        </div>
      </form>

      <h2>Showing now</h2>
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No active notices.</p>
      ) : (
        <>
          <DataTable
            rows={rows.map((r) => ({ Kind: r.Kind, Importance: r.Severity, Title: r.Title, Message: r.Message, Ends: r.ExpiresAt ?? 'No end' }))}
          />
          <p>
            {rows.map((r) => (
              <button key={r.NotificationID} type="button" className="btn-danger" onClick={() => dismiss(r)} style={{ marginRight: 8, marginTop: 8 }}>
                Dismiss: {r.Title}
              </button>
            ))}
          </p>
        </>
      )}
    </div>
  )
}

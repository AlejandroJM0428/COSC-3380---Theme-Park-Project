import { useCallback, useEffect, useState } from 'react'
import { createNotification, dismissNotification, listNotifications, updateNotification } from '../api/index.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const BLANK = { severity: 'Info', title: '', message: '', expiresAt: '' }

// Promos and notices. Staff add and edit promos here and can dismiss any notice (dismiss = soft delete).
export default function NotificationsPage() {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)

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
      const body = { ...form, expiresAt: form.expiresAt || null }
      if (editingId) {
        await updateNotification(editingId, body)
        setNotice('Promo updated.')
      } else {
        await createNotification(body)
        setNotice('Promo added. It now shows on the homepage.')
      }
      setForm(BLANK)
      setEditingId(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(row) {
    setError('')
    setNotice('')
    setEditingId(row.NotificationID)
    setForm({
      severity: row.Severity,
      title: row.Title,
      message: row.Message,
      expiresAt: row.ExpiresAt ? String(row.ExpiresAt).slice(0, 16).replace('T', ' ') : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(BLANK)
  }

  async function dismiss(row) {
    if (!window.confirm(`Dismiss "${row.Title}"? It will stop showing on the homepage.`)) return
    setError('')
    setNotice('')
    try {
      await dismissNotification(row.NotificationID)
      if (editingId === row.NotificationID) cancelEdit()
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
        Add a promo here. It shows on the homepage until it is dismissed or it expires. A ride set to Maintenance is listed here too. That row is created by the database trigger.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {notice && <p className="page-note">{notice}</p>}

      <form className="rm-form" onSubmit={submit}>
        <h2>{editingId ? 'Edit promo' : 'Add a promo'}</h2>
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
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add promo'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} style={{ marginLeft: 8 }}>
              Cancel
            </button>
          )}
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
              <span key={r.NotificationID} style={{ marginRight: 12, marginTop: 8, display: 'inline-block' }}>
                {r.Kind === 'Promo' && (
                  <button type="button" onClick={() => startEdit(r)} style={{ marginRight: 4 }}>
                    Edit: {r.Title}
                  </button>
                )}
                <button type="button" className="btn-danger" onClick={() => dismiss(r)}>
                  Dismiss: {r.Title}
                </button>
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  )
}

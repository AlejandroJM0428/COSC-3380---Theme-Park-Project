import { useEffect, useState } from 'react'
import { listTriggers } from '../api/triggers.js'
import ErrorBanner from '../components/ErrorBanner.jsx'
import './TriggerList.css'

// Every trigger in the project: what it enforces, where it runs, the messages it returns,
// and whether it exists in the live database. Read only. The triggers fire on every save
// from every page, so this page does not run anything.
export default function TriggerList() {
  const [live, setLive] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listTriggers()
      .then(setLive)
      .catch((e) => setError(e.message))
  }, [])

  const triggers = [...(live?.triggers ?? [])].sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))

  return (
    <div className="trg-page">
      <h1>Triggers</h1>
      <p className="muted">
        These rules live inside the database, so they apply to every save from every page, the SQL console and the
        Row Editor included. A refused change returns the message listed under the trigger.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />

      {live && !live.live && <p className="muted">The live trigger list could not be read from the database.</p>}
      {live?.live && (
        <p className="trg-summary">
          <strong>{live.liveCount} triggers</strong> in the database
          {live.liveCount === live.expected ? ', which matches this list.' : `. This list expects ${live.expected}.`}
          {live.extra?.length > 0 && ` Extra: ${live.extra.join(', ')}.`}
        </p>
      )}

      {!live && !error && <p className="muted">Loading…</p>}

      {triggers.map((t) => (
        <section key={t.name} className="trg-group">
          <header className="trg-head">
            <h2>{t.name}</h2>
            {t.inDatabase != null && (
              <span className={t.inDatabase ? 'trg-status trg-status-ok' : 'trg-status trg-status-missing'}>
                {t.inDatabase ? 'In database' : 'Missing from database'}
              </span>
            )}
          </header>
          <p className="trg-where">
            {t.timing} {t.event} on <strong>{t.table}</strong> · {t.kind}
          </p>
          <p className="trg-rule">{t.rule}</p>
          {t.errors.length > 0 && (
            <ul className="trg-errors" aria-label={`Messages ${t.name} returns`}>
              {t.errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

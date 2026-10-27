import { useEffect, useState } from 'react'
import { listDemos, runDemo } from '../api'
import { listTriggers } from '../api/triggers.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import './TriggerDemo.css'

const KINDS = ['All', 'Notification', 'Automatic', 'Check']

const KIND_HELP = {
  Notification: 'Posts a notice on the homepage',
  Automatic: 'Fills in or refreshes data by itself',
  Check: 'Refuses a bad change with an error',
}

const when = (t) => `${t.timing.charAt(0)}${t.timing.slice(1).toLowerCase()} ${t.event.toLowerCase()}`

function DemoResult({ result }) {
  if (!result) return null
  if (result.busy) return <p className="muted">Running...</p>
  if (result.error) {
    return (
      <p role="alert" className="result blocked">
        {result.error}
      </p>
    )
  }
  const d = result.data
  if (!d) return null
  return d.blocked ? (
    <p className="result blocked">
      Blocked by the database: <strong>{d.message}</strong>
      {d.matches === false && <em> (expected: {d.expected})</em>}
    </p>
  ) : (
    <p className="result allowed">{d.message} Nothing was kept.</p>
  )
}

function StatusBadge({ inDatabase }) {
  if (inDatabase === null) return <span className="trg-status trg-status-unknown">Not checked</span>
  return inDatabase ? (
    <span className="trg-status trg-status-ok">In database</span>
  ) : (
    <span className="trg-status trg-status-missing">Missing from database</span>
  )
}

export default function TriggerDemo() {
  const [data, setData] = useState(null)
  const [demos, setDemos] = useState([])
  const [results, setResults] = useState({})
  const [kind, setKind] = useState('All')
  const [error, setError] = useState('')

  useEffect(() => {
    listTriggers()
      .then(setData)
      .catch((e) => setError(e.message))
    listDemos()
      .then(setDemos)
      .catch((e) => setError(e.message))
  }, [])

  async function run(id, mode) {
    const key = `${id}:${mode}`
    setResults((r) => ({ ...r, [key]: { busy: true } }))
    try {
      const out = await runDemo(id, mode)
      setResults((r) => ({ ...r, [key]: { data: out } }))
    } catch (e) {
      setResults((r) => ({ ...r, [key]: { error: e.message } }))
    }
  }

  const triggers = data?.triggers ?? []
  const count = (k) => triggers.filter((t) => t.kind === k).length
  const shown = kind === 'All' ? triggers : triggers.filter((t) => t.kind === kind)
  const missing = triggers.filter((t) => t.inDatabase === false)
  const demoTitle = (id) => demos.find((d) => d.id === id)?.title ?? id

  return (
    <div className="trg-page">
      <h1>Database triggers</h1>
      <p className="muted">
        Triggers are rules the database enforces on its own, whichever page or program makes the change.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />

      {!data && !error && <p className="muted">Loading…</p>}

      {data && (
        <>
          <p className="trg-summary">
            <strong>{triggers.length} triggers:</strong> {count('Notification')} post notices, {count('Automatic')}{' '}
            update data automatically, {count('Check')} check and refuse bad changes.
          </p>
          {data.live ? (
            <p className="muted">
              {data.liveCount} found in the live database.
              {missing.length > 0 && ` ${missing.length} described here but missing from the database (marked below).`}
            </p>
          ) : (
            <p className="muted">
              The live trigger list could not be read, so this is the project&apos;s own list and was not checked
              against the database.
            </p>
          )}

          <div className="button-row trg-filters" role="group" aria-label="Filter by kind">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={k === kind ? 'trg-filter trg-filter-on' : 'trg-filter'}
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
              >
                {k}
                {k !== 'All' && ` (${count(k)})`}
              </button>
            ))}
          </div>
          {kind !== 'All' && <p className="muted">{KIND_HELP[kind]}.</p>}

          <div className="trg-list">
            {shown.map((t) => (
              <article key={t.name} className={`panel trg trg-${t.kind.toLowerCase()}`}>
                <header className="trg-head">
                  <h2>{t.name}</h2>
                  <span className="trg-kind">{t.kind}</span>
                  <StatusBadge inDatabase={t.inDatabase} />
                </header>
                <p className="trg-where">
                  {when(t)} on <strong>{t.table}</strong>
                </p>
                <p className="trg-rule">{t.rule}</p>

                {t.errors.length > 0 && (
                  <ul className="trg-errors" aria-label="Error messages this trigger can raise">
                    {t.errors.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}

                {t.demos.map((id) => (
                  <div key={id} className="trg-demo">
                    <p>
                      <strong>Try it:</strong> {demoTitle(id)}
                    </p>
                    <div className="button-row">
                      <button type="button" className="btn-danger" onClick={() => run(id, 'blocked')}>
                        Try the bad insert
                      </button>
                      <button type="button" onClick={() => run(id, 'allowed')}>
                        Try the good insert
                      </button>
                    </div>
                    <DemoResult result={results[`${id}:blocked`]} />
                    <DemoResult result={results[`${id}:allowed`]} />
                  </div>
                ))}

                {t.body && (
                  <details className="trg-sql">
                    <summary>Show the trigger&apos;s SQL</summary>
                    <pre>{t.body}</pre>
                  </details>
                )}
              </article>
            ))}
          </div>

          <h2 className="trg-sub">Notices the triggers have created</h2>
          {data.recent.length > 0 ? (
            <DataTable rows={data.recent} columns={['Kind', 'Severity', 'Title', 'Message', 'CreatedAt']} />
          ) : (
            <p className="muted">None yet, or the notifications table has not been added to the database.</p>
          )}

          <p className="muted trg-note">{data.eventNote}</p>
          <p className="muted trg-note">
            Every demo runs a real insert inside a transaction and rolls it back, so nothing is saved. The error text
            comes from the trigger itself.
          </p>
        </>
      )}
    </div>
  )
}

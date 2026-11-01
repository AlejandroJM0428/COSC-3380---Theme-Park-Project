import { useEffect, useState } from 'react'
import { listDemos, runDemo } from '../api'
import { listTriggers } from '../api/triggers.js'
import ErrorBanner from '../components/ErrorBanner.jsx'
import './TriggerDemo.css'

const NOTICE = {
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
}

function show(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return String(value)
  return String(value)
}

function Flow({ demo, result }) {
  const data = result?.data
  return (
    <ol className="trg-flow">
      <li>
        <strong>Input</strong>
        <ul>
          {demo.inputs.map((item) => (
            <li key={item.label}>
              {item.label}: {item.value}
            </li>
          ))}
        </ul>
      </li>
      <li>
        <strong>SQL {demo.sqlKind || 'INSERT'}</strong>
        <pre>{demo.sql}</pre>
      </li>
      <li>
        <strong>Trigger</strong>
        <p>{demo.trigger}</p>
      </li>
      <li>
        <strong>Business rule</strong>
        <p>{demo.rule}</p>
      </li>
      <li>
        <strong>Database result</strong>
        {!data && <p className="muted">Not run yet.</p>}
        {data?.outcome === 'error' && demo.spotlight !== 2 && (
          <p>
            Refused: {data.message}
            {data.matches === false && <em> (expected: {data.expected})</em>}
          </p>
        )}
        {demo.spotlight === 1 && data?.after?.Title && (
          <div className="trg-alert">
            <div className="trg-alert-top">
              <strong>{data.after.Title}</strong>
              <span className="trg-badge">New</span>
            </div>
            <p>{data.after.Message}</p>
            <p className="muted">Automatically created by the database trigger.</p>
          </div>
        )}
        {demo.spotlight === 2 && data?.outcome === 'error' && (
          <div className="trg-alert trg-alert-bad">
            <strong>Membership Rejected</strong>
            <p>{data.message}</p>
            <p className="muted">Database prevents invalid data from being saved.</p>
          </div>
        )}
        {data && data.outcome !== 'error' && data.after && demo.spotlight !== 1 && (
          <table className="trg-compare">
            <thead>
              <tr>
                <th>Column</th>
                <th>Sent</th>
                <th>Stored</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(data.after).map((key) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{data.before && key in data.before ? show(data.before[key]) : '—'}</td>
                  <td>{show(data.after[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.outcome !== 'error' && !data.after && <p>{data.message}</p>}
      </li>
      <li>
        <strong>Notification</strong>
        {result?.busy && <p className="muted">Running against MySQL…</p>}
        {result?.error && <p className="trg-notice trg-notice-error">{result.error}</p>}
        {data && (
          <p className={`trg-notice trg-notice-${data.outcome}`}>
            <strong>{NOTICE[data.outcome]}.</strong> {data.message} Nothing was saved.
          </p>
        )}
      </li>
    </ol>
  )
}

export default function TriggerDemo() {
  const [demos, setDemos] = useState([])
  const [live, setLive] = useState(null)
  const [results, setResults] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    listDemos()
      .then(setDemos)
      .catch((e) => setError(e.message))
    listTriggers()
      .then(setLive)
      .catch((e) => setError(e.message))
  }, [])

  async function run(id) {
    setResults((r) => ({ ...r, [id]: { busy: true } }))
    try {
      const data = await runDemo(id)
      setResults((r) => ({ ...r, [id]: { data } }))
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { error: e.message } }))
    }
  }

  const spotlights = demos.filter((d) => d.spotlight).sort((a, b) => a.spotlight - b.spotlight)
  const triggers = []
  for (const demo of demos.filter((d) => !d.spotlight)) {
    const group = triggers.find((g) => g.name === demo.trigger)
    if (group) group.demos.push(demo)
    else triggers.push({ name: demo.trigger, rule: demo.rule, demos: [demo] })
  }

  const liveByName = new Map((live?.triggers ?? []).map((t) => [t.name, t]))

  return (
    <div className="trg-page">
      <h1>Trigger demo</h1>
      <p className="muted">
        The three presentation demos run real SQL in MySQL, show the trigger result, then roll the change back so park
        data stays as it was.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />

      {live?.live && (
        <p className="trg-summary">
          <strong>{live.liveCount} triggers</strong> in the database
          {live.liveCount === live.expected ? ', which matches this page.' : `. This page expects ${live.expected}.`}
          {live.extra?.length > 0 && ` Extra: ${live.extra.join(', ')}.`}
        </p>
      )}

      {!demos.length && !error && <p className="muted">Loading…</p>}

      {spotlights.length > 0 && (
        <table className="trg-compare trg-present">
          <thead>
            <tr>
              <th></th>
              {spotlights.map((d) => (
                <th key={d.id}>Demo {d.spotlight}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Type</th>
              {spotlights.map((d) => (
                <td key={d.id}>{d.purpose}</td>
              ))}
            </tr>
            <tr>
              <th>Trigger timing</th>
              {spotlights.map((d) => (
                <td key={d.id}>{d.timing}</td>
              ))}
            </tr>
            <tr>
              <th>Action</th>
              {spotlights.map((d) => (
                <td key={d.id}>{d.action}</td>
              ))}
            </tr>
            <tr>
              <th>Demonstrates</th>
              {spotlights.map((d) => (
                <td key={d.id}>{d.shows}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {spotlights.map((demo) => (
        <article key={demo.id} className="panel trg-demo">
          <h2>{demo.title}</h2>
          <p className="trg-where">
            {demo.timing} on <strong>{demo.trigger}</strong>
          </p>
          <Flow demo={demo} result={results[demo.id]} />
          <button type="button" onClick={() => run(demo.id)} disabled={results[demo.id]?.busy}>
            {results[demo.id]?.busy ? 'Running…' : demo.button}
          </button>
        </article>
      ))}

      {triggers.length > 0 && <h2 className="trg-sub">More trigger checks</h2>}

      {triggers.map((group) => {
        const row = liveByName.get(group.name)
        return (
          <section key={group.name} className="trg-group">
            <header className="trg-head">
              <h2>{group.name}</h2>
              {row && (
                <span className={row.inDatabase ? 'trg-status trg-status-ok' : 'trg-status trg-status-missing'}>
                  {row.inDatabase ? 'In database' : 'Missing from database'}
                </span>
              )}
            </header>
            <p className="trg-rule">{row?.rule ?? group.rule}</p>
            {group.demos.map((demo) => (
              <article key={demo.id} className="panel trg-demo">
                <h3>{demo.title}</h3>
                <Flow demo={demo} result={results[demo.id]} />
                <button type="button" onClick={() => run(demo.id)} disabled={results[demo.id]?.busy}>
                  {results[demo.id]?.busy ? 'Running…' : demo.button || 'Run against MySQL'}
                </button>
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}

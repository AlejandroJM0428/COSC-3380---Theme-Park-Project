import { useEffect, useState } from 'react'
import { listDemos, runDemo } from '../api'
import ErrorBanner from '../components/ErrorBanner.jsx'

export default function TriggerDemo() {
  const [demos, setDemos] = useState([])
  const [results, setResults] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    listDemos().then(setDemos).catch((e) => setError(e.message))
  }, [])

  async function run(id, mode) {
    const key = `${id}:${mode}`
    setResults((r) => ({ ...r, [key]: { busy: true } }))
    try {
      const data = await runDemo(id, mode)
      setResults((r) => ({ ...r, [key]: { data } }))
    } catch (e) {
      setResults((r) => ({ ...r, [key]: { error: e.message } }))
    }
  }

  function Result({ id, mode }) {
    const r = results[`${id}:${mode}`]
    if (!r) return null
    if (r.busy) return <p className="muted">Running...</p>
    if (r.error)
      return (
        <p role="alert" className="result blocked">
          {r.error}
        </p>
      )
    const d = r.data
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

  return (
    <div>
      <h1>Trigger Demos</h1>
      <p className="muted">
        Each button runs a real insert inside a database transaction. The text you see comes from the trigger itself.
        Every run is rolled back, so nothing is saved.
      </p>
      <ErrorBanner message={error} onClose={() => setError('')} />

      {demos.map((d) => (
        <section key={d.id} className="panel demo">
          <h2>{d.title}</h2>
          <p>{d.proves}</p>
          <div className="button-row">
            <button type="button" className="btn-danger" onClick={() => run(d.id, 'blocked')}>
              Try the bad insert
            </button>
            <button type="button" onClick={() => run(d.id, 'allowed')}>
              Try the good insert
            </button>
          </div>
          <Result id={d.id} mode="blocked" />
          <Result id={d.id} mode="allowed" />
        </section>
      ))}
    </div>
  )
}

import { useState } from 'react'
import './ReportParams.css'

// "How this was calculated": the SQL the server really ran for this result, with the values filled in, and the proof
// that goes with it (row count, run time, a fingerprint of the rows). Closed by default; one click opens it.
//   <ReportSql evidence={...} after={['Month = 2026-10']} />
// `evidence` comes back from POST /api/reports/:name/run and GET /api/queries/:id. `after` lists anything the page
// did to the rows AFTER the SQL (so it is not part of the SQL above); an empty list means the table is exactly the SQL result.
export default function ReportSql({ evidence, after = [] }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!evidence) return null

  function copy() {
    navigator.clipboard
      ?.writeText(evidence.sql)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <div className="rs-box">
      <div className="rs-bar">
        <button type="button" className="rs-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide SQL' : 'Show SQL'}
        </button>
        <span className="muted">
          {evidence.rowCount.toLocaleString('en-US')} row(s) from MySQL in {evidence.ms} ms
        </span>
      </div>

      {evidence.truncated && (
        <p className="rs-warn">Showing the first {evidence.limit.toLocaleString('en-US')} rows. Narrow the filters or raise the row limit to see the rest.</p>
      )}

      {open && (
        <div className="rs-panel">
          <h3>How this was calculated</h3>
          <p className="muted">
            Source: <strong>{evidence.source}</strong>. This is the statement the server sent to MySQL for this run. It runs read only, and the values you chose are
            bound to it, never pasted into the text.
          </p>
          {evidence.rules?.length > 0 && (
            <>
              <strong>Rules this report always follows</strong>
              <ul>
                {evidence.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          <div className="rs-sqlhead">
            <strong>SQL, with your values filled in</strong>
            <button type="button" className="rs-copy" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="rs-sql">{evidence.sql}</pre>
          {evidence.params?.length > 0 && (
            <details>
              <summary>Statement as sent, and the {evidence.params.length} bound value(s)</summary>
              <pre className="rs-sql">{evidence.template}</pre>
              <pre className="rs-sql">{JSON.stringify(evidence.params)}</pre>
            </details>
          )}
          <dl className="rs-facts">
            <div>
              <dt>Rows returned</dt>
              <dd>{evidence.rowCount.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Run time</dt>
              <dd>{evidence.ms} ms</dd>
            </div>
            <div>
              <dt>Ran at</dt>
              <dd>{new Date(evidence.ranAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Result fingerprint</dt>
              <dd>
                <code>{evidence.hash}</code>
              </dd>
            </div>
          </dl>
          <p className="muted">
            The fingerprint is a hash of the rows MySQL returned. Run the same SQL in any MySQL client and the same rows give the same fingerprint
            (<code>node server/scripts/verify-reports.js</code> does this check for every report).
          </p>
          {after.length > 0 ? (
            <p className="rs-warn">
              After the SQL, the page also did this to the rows (it is not part of the SQL above): {after.join('; ')}.
            </p>
          ) : (
            <p className="muted">Nothing was changed after the SQL: the table shows exactly these rows.</p>
          )}
        </div>
      )}
    </div>
  )
}

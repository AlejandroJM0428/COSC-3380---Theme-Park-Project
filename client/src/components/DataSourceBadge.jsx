import './DataSourceBadge.css'
import { USE_MOCK } from '../api/index.js'

// Says out loud where a report's numbers come from, so nobody has to guess.
//   <DataSourceBadge evidence={evidence} calculatedHere={['Share of revenue']} />
//
//   Live query  : the server sent back evidence, so the SQL really ran against MySQL.
//   Hardcoded   : mock mode (client/src/api/mock.js). These are made-up sample numbers.
//   No proof    : live mode but no evidence came back. Do not trust the numbers until it does.
//
// calculatedHere lists columns the BROWSER worked out from the query rows (not part of the SQL).
export default function DataSourceBadge({ evidence, calculatedHere = [] }) {
  const state = USE_MOCK ? 'mock' : evidence ? 'live' : 'none'

  return (
    <div className={`dsb dsb-${state}`} role="status">
      {state === 'live' && (
        <>
          <strong>Live query</strong>
          <span>
            {evidence.source}: {evidence.rowCount.toLocaleString('en-US')} row(s) from MySQL in {evidence.ms} ms
          </span>
        </>
      )}
      {state === 'mock' && (
        <>
          <strong>Hardcoded sample data</strong>
          <span>Not from the database. Set VITE_USE_MOCK=false in client/.env and restart to see real numbers.</span>
        </>
      )}
      {state === 'none' && (
        <>
          <strong>No query proof</strong>
          <span>The server did not send evidence for this table, so it is not verified as a live query.</span>
        </>
      )}
      {calculatedHere.length > 0 && <span className="dsb-calc">Worked out in the browser: {calculatedHere.join(', ')}</span>}
    </div>
  )
}

import { useRef, useState } from 'react'
import { adminTransactions } from '../../api'
import ErrorBanner from '../ErrorBanner.jsx'
import '../DataTable.css'
import './TransactionsPanel.css'

// Admin tool: Transactions per ID (GET /api/admin/transactions/:type/:id). Read only.
// Give a customer, ticket or membership ID and see that record with its memberships, tickets, food and shop
// purchases, game plays, ride boardings and refunds, plus totals. Totals cover every row; each list shows at most
// 500 rows and says so when it was cut.

const TYPES = [
  { value: 'customer', label: 'Customer ID' },
  { value: 'ticket', label: 'Ticket ID' },
  { value: 'membership', label: 'Membership ID' },
]

const GROUPS = [
  { key: 'memberships', title: 'Memberships' },
  { key: 'tickets', title: 'Tickets' },
  { key: 'purchases', title: 'Food and shop purchases' },
  { key: 'gamePlays', title: 'Game plays' },
  { key: 'rides', title: 'Ride boardings' },
  { key: 'refunds', title: 'Refunds' },
]

const YES_NO = new Set(['IsActive', 'HasExpress', 'AutoRenew', 'Refunded', 'UsedExpress'])
const MONEY = new Set(['TicketPrice', 'Price', 'UnitPrice', 'LineTotal', 'AmountPaid'])
const CELL_LIMIT = 120

const money = (v) =>
  `$${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// 'TicketPrice' -> 'Ticket Price', 'CustomerID' -> 'Customer ID'
function label(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

function formatValue(column, value) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>
  if (YES_NO.has(column)) return Number(value) ? 'Yes' : 'No'
  if (MONEY.has(column)) return money(value)
  const text = String(value)
  if (text.length > CELL_LIMIT) return <span title={text}>{text.slice(0, CELL_LIMIT)}…</span>
  return text
}

function Group({ title, group }) {
  const rows = group.rows
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  return (
    <details className="tx-group" open={rows.length > 0}>
      <summary>
        {title} ({rows.length.toLocaleString('en-US')}
        {group.truncated ? '+' : ''})
      </summary>
      {rows.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <>
          {group.truncated && (
            <p className="page-note">
              Only the first {rows.length.toLocaleString('en-US')} rows are shown. The totals above cover every row.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className={MONEY.has(c) ? 'dt-num' : undefined}>
                      {label(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c} className={MONEY.has(c) ? 'dt-num' : undefined}>
                        {formatValue(c, row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  )
}

export default function TransactionsPanel() {
  const [type, setType] = useState('customer')
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const runId = useRef(0)

  async function lookup(e) {
    e.preventDefault()
    if (busy) return
    const clean = id.trim()
    if (!/^\d+$/.test(clean)) {
      setError('Type the ID as a whole number, for example 1')
      setResult(null)
      return
    }
    const run = ++runId.current
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const out = await adminTransactions(type, clean)
      if (run === runId.current) setResult(out)
    } catch (err) {
      if (run === runId.current) setError(err.message)
    } finally {
      if (run === runId.current) setBusy(false)
    }
  }

  const s = result?.summary
  const stats = s
    ? [
        { value: money(s.totalSpend), name: 'Total spend, before refunds' },
        { value: money(s.ticketSpend), name: 'Ticket spend' },
        { value: money(s.purchaseSpend), name: 'Food and shop spend' },
        { value: money(s.gameSpend), name: 'Game spend' },
        { value: s.tickets.toLocaleString('en-US'), name: 'Tickets' },
        { value: s.boardings.toLocaleString('en-US'), name: 'Ride boardings' },
        { value: s.refunds.toLocaleString('en-US'), name: 'Refunds' },
      ]
    : []

  return (
    <section className="admin-panel" aria-labelledby="tx-title">
      <h3 id="tx-title">Transactions per ID</h3>
      <p className="muted">
        Look up a customer, ticket or membership and see everything attached to it. Read only.
      </p>

      <form className="toolbar" onSubmit={lookup}>
        <label>
          Look up by
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ID number
          <input
            type="text"
            inputMode="numeric"
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="off"
            placeholder="1"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {result && !result.found && <p className="page-note">{result.message}</p>}

      {result?.found && (
        <div key={`${result.type}-${result.id}`}>
          <dl className="tx-record">
            {Object.entries(result.record).map(([column, value]) => (
              <div key={column}>
                <dt>{label(column)}</dt>
                <dd>{formatValue(column, value)}</dd>
              </div>
            ))}
          </dl>

          <div className="tx-stats">
            {stats.map((st) => (
              <div className="tx-stat" key={st.name}>
                <strong>{st.value}</strong>
                <span>{st.name}</span>
              </div>
            ))}
          </div>

          {GROUPS.map((g) => (
            <Group key={g.key} title={g.title} group={result.groups[g.key]} />
          ))}
        </div>
      )}
    </section>
  )
}

import { Fragment, useMemo, useState } from 'react'
import './DataTable.css'

// Every row is shown (no paging). A long table scrolls inside its own box and the header row stays in view.

const isEmpty = (v) => v === null || v === undefined || v === ''

// Money columns get a dollar sign and two decimals. Matched by column name, so "ShareOfRevenue" (a percent) is excluded.
const MONEY_COLUMN = /Revenue|Cost|Price|Spend|Sale|Total|Fees|AvgFood|AvgShop|AvgGames|AvgExtras/
const NOT_MONEY = /Share|Rate$|Hours|Pct/
// Whole-number identifiers and calendar parts stay plain: 2026 must not become 2,026.
const PLAIN_NUMBER = /(^|[a-z])(Year|Month|Day|ID|Id|Key|Rank)$|^(Year|Month|Rank)$/

const isMoneyColumn = (key) => MONEY_COLUMN.test(key) && !NOT_MONEY.test(key)

// MySQL sends BOOL columns as 0/1. These flag columns read better as Yes / No.
const YES_NO_COLUMN = /^(AutoRenew|IsActive|IsIndoor|HasExpress)$/

function formatCell(value, key = '') {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (YES_NO_COLUMN.test(key) && (value === 0 || value === 1)) return value ? 'Yes' : 'No'
  // Money columns sometimes arrive as DECIMAL text ("1234.5"); turn those into numbers so they format too.
  if (typeof value === 'string' && isMoneyColumn(key) && /^-?\d+(\.\d+)?$/.test(value)) value = Number(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (isMoneyColumn(key)) {
      return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    if (PLAIN_NUMBER.test(key)) return String(value)
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return String(value)
}

// 'TotalHoursDown' -> 'Total Hours Down', 'MaintenanceID' -> 'Maintenance ID', 'ExpiringIn30Days' -> 'Expiring In 30 Days'
function headerLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim()
}

// Numbers compare as numbers (MySQL sends some as text); everything else, including 'YYYY-MM-DD' dates, compares as text.
function compareValues(a, b) {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

// One cell of the Actions column. The tooltip sits on a wrapper because a disabled button shows none in some browsers.
function ActionCell({ action }) {
  if (!action) return <td className="dt-detail" />
  return (
    <td className="dt-detail">
      <span title={action.title || undefined}>
        <button type="button" className="dt-toggle" disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </button>
      </span>
    </td>
  )
}

const markClass = (m) => (m === 'high' ? 'dt-row-high' : m === 'low' ? 'dt-row-low' : undefined)

// <DataTable rows={[...]} columns={['A','B']} rowClass={(row) => 'high' | 'low' | undefined} labelOf={(column) => 'Header text'} />   (columns optional: defaults to every key;
// labelOf optional: reports pass their plain-label function, without it the header is the column name split into words)
// rowClass is optional: 'high' shades the row green and 'low' shades it red, so unusual rows stand out.
// Click a column header to sort: first click ascending, second descending, third back to the original order.
// onDetail, when passed, adds a Details button on each row. detailKey is the open row (JSON.stringify of that row).
// pageSize, when passed, draws only that many rows at first and adds a "Show more" button (sorting still covers every row).
// rowAction(row), when passed, adds a last, non-sortable Actions column. It returns null (no button on that row) or
// { label, onClick, disabled, title }; a disabled button is greyed and shows title as its tooltip (for example "Insufficient privileges").
// The column is left out altogether when no row returns an action. The cell is not part of the row data, so search boxes never see it.
export default function DataTable({ rows, columns, rowClass, labelOf, onDetail, detailKey, detailSlot, pageSize, rowAction }) {
  const [sort, setSort] = useState(null) // null, or { key, dir: 'asc' | 'desc' }
  const [visible, setVisible] = useState(pageSize ?? Infinity)

  const sorted = useMemo(() => {
    if (!sort || !rows) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    const filled = rows.filter((r) => !isEmpty(r[sort.key]))
    const blank = rows.filter((r) => isEmpty(r[sort.key]))
    filled.sort((x, y) => compareValues(x[sort.key], y[sort.key]) * dir)
    return [...filled, ...blank] // empty cells always go last
  }, [rows, sort])

  if (!rows || rows.length === 0) return <p className="muted">No data to show.</p>
  const cols = columns ?? Object.keys(rows[0])
  const hasAction = Boolean(rowAction) && rows.some((r) => rowAction(r))

  // A column is a number column when its first filled cell is a number (reports turn DECIMAL text into numbers in prepare()).
  const numeric = new Set(
    cols.filter((c) => {
      const first = rows.find((r) => !isEmpty(r[c]))
      return first !== undefined && typeof first[c] === 'number'
    }),
  )

  function toggleSort(key) {
    setSort((s) => {
      if (s?.key !== key) return { key, dir: 'asc' }
      return s.dir === 'asc' ? { key, dir: 'desc' } : null
    })
  }

  return (
    <>
      <div className="table-wrap dt-scroll">
        <table>
          <thead>
            <tr>
              {cols.map((c) => {
                const active = sort?.key === c
                return (
                  <th
                    key={c}
                    className={numeric.has(c) ? 'dt-num' : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button type="button" className="dt-sort" onClick={() => toggleSort(c)} title="Click to sort">
                      {labelOf ? labelOf(c) : headerLabel(c)}
                      <span className="dt-arrow" aria-hidden="true">
                        {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
              {onDetail && <th className="dt-detail">Details</th>}
              {hasAction && <th className="dt-detail">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(pageSize ? sorted.slice(0, visible) : sorted).map((row, i) => (
              <Fragment key={i}>
                <tr className={rowClass ? markClass(rowClass(row)) : undefined}>
                  {cols.map((c) => (
                    <td key={c} className={numeric.has(c) ? 'dt-num' : undefined}>
                      {formatCell(row[c], c)}
                    </td>
                  ))}
                  {onDetail && (
                    <td className="dt-detail">
                      <button
                        type="button"
                        className="dt-toggle"
                        aria-expanded={detailKey === JSON.stringify(row)}
                        onClick={() => onDetail(row)}
                      >
                        {detailKey === JSON.stringify(row) ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  )}
                  {hasAction && <ActionCell action={rowAction(row)} />}
                </tr>
                {onDetail && detailSlot && detailKey === JSON.stringify(row) && (
                  <tr className="dt-detail-row">
                    <td colSpan={cols.length + 1 + (hasAction ? 1 : 0)}>{detailSlot}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && sorted.length > visible && (
        <p className="dt-more">
          Showing {Math.min(visible, sorted.length).toLocaleString('en-US')} of {sorted.length.toLocaleString('en-US')} rows.{' '}
          <button type="button" className="dt-toggle" onClick={() => setVisible((v) => v + pageSize)}>
            Show {Math.min(pageSize, sorted.length - visible).toLocaleString('en-US')} more
          </button>
        </p>
      )}
    </>
  )
}

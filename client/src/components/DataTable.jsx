import { useMemo, useState } from 'react'
import './DataTable.css'

// Long reports show the first rows plus a "Show all" button, so a big view does not freeze the page.
const ROW_LIMIT = 100

const isEmpty = (v) => v === null || v === undefined || v === ''

function formatCell(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
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

const markClass = (m) => (m === 'high' ? 'dt-row-high' : m === 'low' ? 'dt-row-low' : undefined)

// <DataTable rows={[...]} columns={['A','B']} rowClass={(row) => 'high' | 'low' | undefined} />   (columns optional: defaults to every key)
// rowClass is optional: 'high' shades the row green and 'low' shades it red, so unusual rows stand out.
// Click a column header to sort: first click ascending, second descending, third back to the original order.
export default function DataTable({ rows, columns, rowClass }) {
  const [sort, setSort] = useState(null) // null, or { key, dir: 'asc' | 'desc' }
  const [showAll, setShowAll] = useState(false)

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

  // A column is a number column when its first filled cell is a number (reports turn DECIMAL text into numbers in prepare()).
  const numeric = new Set(
    cols.filter((c) => {
      const first = rows.find((r) => !isEmpty(r[c]))
      return first !== undefined && typeof first[c] === 'number'
    }),
  )

  const visible = showAll ? sorted : sorted.slice(0, ROW_LIMIT)

  function toggleSort(key) {
    setSort((s) => {
      if (s?.key !== key) return { key, dir: 'asc' }
      return s.dir === 'asc' ? { key, dir: 'desc' } : null
    })
  }

  return (
    <>
      <div className="table-wrap">
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
                      {headerLabel(c)}
                      <span className="dt-arrow" aria-hidden="true">
                        {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className={rowClass ? markClass(rowClass(row)) : undefined}>
                {cols.map((c) => (
                  <td key={c} className={numeric.has(c) ? 'dt-num' : undefined}>
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > ROW_LIMIT && (
        <p className="dt-more muted">
          Showing {visible.length.toLocaleString('en-US')} of {sorted.length.toLocaleString('en-US')} rows
          <button type="button" className="dt-toggle" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show first ${ROW_LIMIT}` : 'Show all'}
          </button>
        </p>
      )}
    </>
  )
}

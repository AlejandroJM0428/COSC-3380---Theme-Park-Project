import { useEffect, useMemo, useRef, useState } from 'react'
import DataTable from './DataTable.jsx'
import './DetailModal.css'

// "View all" pop-up for one report line: every matching row, with a search box that filters as you type.
// state = { title, loading, error, data } where data is the answer of the detail endpoint in 'all' mode.
// Search is words: "2025-04 4.50" keeps rows that contain both pieces (case does not matter, any column).
// rowAction(row), when passed, puts an Edit button on each row (same prop as DataTable; see ReportPage.rowActionFor).
const PAGE = 100

export default function DetailModal({ state, onClose, rowAction }) {
  const [query, setQuery] = useState('')
  const search = useRef(null)
  const closeRef = useRef(onClose)
  const rows = state.data?.rows

  useEffect(() => {
    closeRef.current = onClose // the Escape handler below always calls the latest onClose
  })

  // Runs once, on open. It used to depend on onClose, which is a new function on every ReportPage render, so opening or
  // closing the Edit pop-up re-ran it and pulled focus back to the search box instead of the row's Edit button.
  useEffect(() => {
    search.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden' // the page behind does not scroll
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = before
    }
  }, [])

  // One lower-case line of text per row, made once, so typing stays quick on thousands of rows.
  // The RowNo count is left out, so typing 12 does not match row 12.
  const haystack = useMemo(() => (rows ?? []).map((r) => Object.entries(r).filter(([k]) => k !== 'RowNo').map(([, v]) => (v === null || v === undefined ? '' : String(v))).join(' ').toLowerCase()), [rows])

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = useMemo(() => {
    if (!rows) return []
    if (terms.length === 0) return rows
    return rows.filter((_, i) => terms.every((t) => haystack[i].includes(t)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, haystack, query])

  const total = Number(state.data?.total)
  const loaded = rows?.length ?? 0

  return (
    <div className="dm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dm" role="dialog" aria-modal="true" aria-labelledby="dm-title">
        <header className="dm-head">
          <div>
            <h2 id="dm-title">{state.title || 'All matching rows'}</h2>
            {state.data?.label && state.data.label !== 'Source tables' && <p className="muted dm-sub">{state.data.label}</p>}
          </div>
          <button type="button" className="dm-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="dm-bar">
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search these rows (any column)"
            aria-label="Search rows"
            disabled={!rows}
            maxLength={80}
          />
          {rows && (
            <span className="dm-count" role="status">
              {terms.length > 0 ? `${shown.length.toLocaleString('en-US')} of ${loaded.toLocaleString('en-US')} rows` : `${loaded.toLocaleString('en-US')} rows`}
            </span>
          )}
        </div>

        {state.loading && <p className="muted">Loading every matching row…</p>}
        {state.error && <p className="rd-error">{state.error}</p>}
        {state.data?.more && (
          <p className="dm-warn">
            Only the first {loaded.toLocaleString('en-US')} of {total.toLocaleString('en-US')} rows are loaded. Use a shorter date range to see the rest.
          </p>
        )}

        {rows &&
          (shown.length === 0 ? (
            <p className="muted dm-none">No rows match “{query.trim()}”.</p>
          ) : (
            <div className="dm-body">
              <DataTable key={query} rows={shown} pageSize={PAGE} rowAction={rowAction} />
            </div>
          ))}
      </section>
    </div>
  )
}

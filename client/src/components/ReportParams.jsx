import { useEffect, useState } from 'react'
import { getReportOptions } from '../api/index.js'
import { makeLabeler } from '../config/labels.js'
import DateRangePicker from './DateRangePicker.jsx'
import './ReportParams.css'

// The "Search options" panel of a report, chosen BEFORE pressing Run report and sent to the server, which builds the SQL.
// Everything is a click: pick a column to filter on, then dates from the calendar, values from a list, yes/no buttons.
// Typing is only for number limits and for searching a text column that has too many values to list.
// The panel starts open with the report's key fields already on it (`featured`), and shows plain labels instead of column names.
//
//   <ReportParams endpoint meta spec onChange hideColumn label />
//   meta = { columns: [{ name, kind }], limits, defaultLimit }   (from GET /api/reports/:name/params)
//   spec = the state kept by the report page (see emptySpec); toRequest(spec) turns it into the body sent to the server.
//   hideColumn = a column name (or a list of them) that is controlled somewhere else on the page (the date picker, the name search box)
//   label = (column name) => plain label, from makeLabeler in config/labels.js

const FILTERABLE = ['date', 'number', 'flag', 'text']
const FNS = [
  ['count', 'Count rows'],
  ['sum', 'Sum of'],
  ['avg', 'Average of'],
  ['min', 'Smallest'],
  ['max', 'Largest'],
]

// `featured` = the columns to show as ready-to-use (still empty) filters when the panel first opens.
export const emptySpec = (meta, featured = []) => ({
  // [{ column, kind, from, to | min, max | value | values, contains }]
  filters: (meta?.columns ?? [])
    .filter((c) => featured.includes(c.name) && FILTERABLE.includes(c.kind))
    .sort((a, b) => featured.indexOf(a.name) - featured.indexOf(b.name))
    .map((c) => newFilter(c)),
  sort: '',
  dir: 'asc',
  limit: meta?.defaultLimit ?? 1000,
  groupBy: '',
  bucket: 'month',
  measures: [{ fn: 'count' }],
  columns: [], // empty = every column
})

// Result column names, worked out the same way the server names them (so Sort can list them).
export function outputNames(spec, meta) {
  if (!meta) return []
  if (!spec.groupBy) return spec.columns.length ? spec.columns : meta.columns.map((c) => c.name)
  const g = meta.columns.find((c) => c.name === spec.groupBy)
  const names = [g?.kind === 'date' ? `${spec.groupBy} (${spec.bucket})` : spec.groupBy]
  for (const m of spec.measures) names.push(m.fn === 'count' ? 'Rows' : `${m.fn} of ${m.column}`)
  return names
}

// A summary or a column choice replaces the report's own table, charts and headline numbers (they expect every column).
export const isCustom = (spec) => Boolean(spec.groupBy) || spec.columns.length > 0

// The body sent to POST /api/reports/:name/run. Filters that were added but left empty are dropped.
export function toRequest(spec) {
  const filters = []
  for (const f of spec.filters) {
    if (f.kind === 'date') {
      if (f.from || f.to) filters.push({ column: f.column, from: f.from || undefined, to: f.to || undefined })
    } else if (f.kind === 'number') {
      if (f.min !== '' || f.max !== '') filters.push({ column: f.column, min: f.min === '' ? undefined : f.min, max: f.max === '' ? undefined : f.max })
    } else if (f.kind === 'flag') {
      if (f.value !== '') filters.push({ column: f.column, value: f.value })
    } else if (f.values.length > 0) {
      filters.push({ column: f.column, values: f.values })
    } else if (f.contains.trim() !== '') {
      filters.push({ column: f.column, contains: f.contains })
    }
  }
  const body = { filters, limit: spec.limit }
  if (spec.sort) {
    body.sort = spec.sort
    body.dir = spec.dir
  }
  if (spec.groupBy) {
    body.groupBy = spec.groupBy
    body.bucket = spec.bucket
    body.measures = spec.measures.length ? spec.measures : [{ fn: 'count' }]
  } else if (spec.columns.length) {
    body.columns = spec.columns
  }
  return body
}

// A filter counts as "set" when it would be sent to the server (an empty one is dropped by toRequest).
function isFilterSet(f) {
  if (f.kind === 'date') return Boolean(f.from || f.to)
  if (f.kind === 'number') return f.min !== '' || f.max !== ''
  if (f.kind === 'flag') return f.value !== ''
  return f.values.length > 0 || f.contains.trim() !== ''
}

function newFilter(col) {
  const base = { column: col.name, kind: col.kind }
  if (col.kind === 'date') return { ...base, from: '', to: '' }
  if (col.kind === 'number') return { ...base, min: '', max: '' }
  if (col.kind === 'flag') return { ...base, value: '' }
  return { ...base, values: [], contains: '' }
}

// Text column: a list of values to click, or a search box when there are too many values to list.
function TextControl({ endpoint, filter, onChange, label }) {
  const [options, setOptions] = useState(undefined) // undefined = loading, null = too many, [..] = the list
  const [failed, setFailed] = useState('')
  useEffect(() => {
    let live = true
    getReportOptions(endpoint, filter.column)
      .then((r) => live && setOptions(r.values))
      .catch((e) => live && setFailed(e.message))
    return () => {
      live = false
    }
  }, [endpoint, filter.column])

  if (failed) return <span className="muted">Could not load the values: {failed}</span>
  if (options === undefined) return <span className="muted">Loading values…</span>
  if (options === null) {
    return (
      <input
        type="text"
        className="rpm-text"
        placeholder="Contains…"
        maxLength={60}
        value={filter.contains}
        onChange={(e) => onChange({ ...filter, contains: e.target.value })}
        aria-label={`${label(filter.column)} contains`}
      />
    )
  }
  const toggle = (v) => onChange({ ...filter, values: filter.values.includes(v) ? filter.values.filter((x) => x !== v) : [...filter.values, v] })
  return (
    <div className="rpm-chips">
      {options.map((v) => (
        <button key={v} type="button" aria-pressed={filter.values.includes(v)} onClick={() => toggle(v)}>
          {v}
        </button>
      ))}
    </div>
  )
}

function FilterRow({ endpoint, filter, onChange, onRemove, label }) {
  return (
    <div className="rpm-filter">
      <span className="rpm-col">{label(filter.column)}</span>
      <div className="rpm-ctl">
        {filter.kind === 'date' && (
          <DateRangePicker label={label(filter.column)} from={filter.from} to={filter.to} onChange={({ from, to }) => onChange({ ...filter, from, to })} />
        )}
        {filter.kind === 'number' && (
          <span className="rpm-range">
            <input type="number" placeholder="Min" value={filter.min} onChange={(e) => onChange({ ...filter, min: e.target.value })} aria-label={`${label(filter.column)} minimum`} />
            <span>to</span>
            <input type="number" placeholder="Max" value={filter.max} onChange={(e) => onChange({ ...filter, max: e.target.value })} aria-label={`${label(filter.column)} maximum`} />
          </span>
        )}
        {filter.kind === 'flag' && (
          <div className="rpm-chips">
            {[['', 'Either'], ['1', 'Yes'], ['0', 'No']].map(([v, label]) => (
              <button key={label} type="button" aria-pressed={String(filter.value) === v} onClick={() => onChange({ ...filter, value: v })}>
                {label}
              </button>
            ))}
          </div>
        )}
        {filter.kind === 'text' && <TextControl endpoint={endpoint} filter={filter} onChange={onChange} label={label} />}
      </div>
      <button type="button" className="rpm-x" onClick={onRemove} aria-label={`Remove the ${label(filter.column)} filter`}>
        ✕
      </button>
    </div>
  )
}

const defaultLabel = makeLabeler()

export default function ReportParams({ endpoint, meta, spec, onChange, hideColumn = '', label = defaultLabel }) {
  if (!meta) return null
  const hidden = new Set([hideColumn].flat().filter(Boolean))
  const set = (patch) => onChange({ ...spec, ...patch })
  const inFilters = new Set(spec.filters.map((f) => f.column))
  const addable = meta.columns.filter((c) => FILTERABLE.includes(c.kind) && !inFilters.has(c.name) && !hidden.has(c.name))
  const shown = spec.filters.filter((f) => !hidden.has(f.column))
  const numbers = meta.columns.filter((c) => c.kind === 'number' || c.kind === 'flag')
  const groupable = meta.columns.filter((c) => c.kind !== 'other')
  const groupKind = meta.columns.find((c) => c.name === spec.groupBy)?.kind
  const names = outputNames(spec, meta)
  const activeCount = shown.filter(isFilterSet).length + (spec.groupBy ? 1 : 0) + (spec.columns.length ? 1 : 0)

  const changeFilter = (i, next) => set({ filters: spec.filters.map((f, k) => (k === i ? next : f)) })
  const setMeasure = (i, patch) => set({ measures: spec.measures.map((m, k) => (k === i ? { ...m, ...patch } : m)) })

  return (
    <details className="rpm" open>
      <summary>
        Search options{activeCount > 0 ? ` (${activeCount} set)` : ''} <span className="muted">set these, then press Run report</span>
      </summary>

      <div className="rpm-section">
        <h4>Filters</h4>
        {shown.length === 0 && <p className="muted">No filters: every row is included.</p>}
        {spec.filters.map((f, i) =>
          hidden.has(f.column) ? null : (
            <FilterRow key={f.column} endpoint={endpoint} label={label} filter={f} onChange={(next) => changeFilter(i, next)} onRemove={() => set({ filters: spec.filters.filter((_, k) => k !== i) })} />
          ),
        )}
        {addable.length > 0 && (
          <label className="rpm-add">
            <span>Add another filter</span>
            <select
              value=""
              onChange={(e) => {
                const col = addable.find((c) => c.name === e.target.value)
                if (col) set({ filters: [...spec.filters, newFilter(col)] })
              }}
            >
              <option value="">Choose what to filter on…</option>
              {addable.map((c) => (
                <option key={c.name} value={c.name}>
                  {label(c.name)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="rpm-section rpm-row">
        <label>
          <span>Sort by</span>
          <select value={names.includes(spec.sort) ? spec.sort : ''} onChange={(e) => set({ sort: e.target.value })}>
            <option value="">Default order</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {label(n)}
              </option>
            ))}
          </select>
        </label>
        <div className="rpm-chips" role="group" aria-label="Sort direction">
          <button type="button" aria-pressed={spec.dir === 'asc'} onClick={() => set({ dir: 'asc' })}>
            Low to high
          </button>
          <button type="button" aria-pressed={spec.dir === 'desc'} onClick={() => set({ dir: 'desc' })}>
            High to low
          </button>
        </div>
        <div className="rpm-limit">
          <span>Rows</span>
          <div className="rpm-chips" role="group" aria-label="Row limit">
            {meta.limits.map((n) => (
              <button key={n} type="button" aria-pressed={spec.limit === n} onClick={() => set({ limit: n })}>
                {n.toLocaleString('en-US')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <details className="rpm-more" open={spec.groupBy || spec.columns.length ? true : undefined}>
        <summary>Summarize, or choose which columns to show</summary>
        <p className="muted">These replace the report&apos;s own charts and headline numbers with a plain table of what you ask for.</p>
        <div className="rpm-section rpm-row">
          <label>
            <span>Group by</span>
            <select
              value={spec.groupBy}
              onChange={(e) => set({ groupBy: e.target.value, sort: '', columns: [], measures: spec.measures.length ? spec.measures : [{ fn: 'count' }] })}
            >
              <option value="">No grouping (list the rows)</option>
              {groupable.map((c) => (
                <option key={c.name} value={c.name}>
                  {label(c.name)}
                </option>
              ))}
            </select>
          </label>
          {spec.groupBy && groupKind === 'date' && (
            <div className="rpm-chips" role="group" aria-label="Date bucket">
              {['day', 'month', 'year'].map((b) => (
                <button key={b} type="button" aria-pressed={spec.bucket === b} onClick={() => set({ bucket: b, sort: '' })}>
                  By {b}
                </button>
              ))}
            </div>
          )}
        </div>

        {spec.groupBy && (
          <div className="rpm-section">
            {spec.measures.map((m, i) => (
              <div className="rpm-row" key={i}>
                <select
                  value={m.fn}
                  aria-label="Measure"
                  onChange={(e) => setMeasure(i, e.target.value === 'count' ? { fn: 'count', column: undefined } : { fn: e.target.value, column: m.column ?? numbers[0]?.name })}
                >
                  {FNS.map(([fn, label]) => (
                    <option key={fn} value={fn} disabled={fn !== 'count' && numbers.length === 0}>
                      {label}
                    </option>
                  ))}
                </select>
                {m.fn !== 'count' && (
                  <select value={m.column ?? ''} aria-label="Measure column" onChange={(e) => setMeasure(i, { column: e.target.value })}>
                    {numbers.map((c) => (
                      <option key={c.name} value={c.name}>
                        {label(c.name)}
                      </option>
                    ))}
                  </select>
                )}
                {spec.measures.length > 1 && (
                  <button type="button" className="rpm-x" aria-label="Remove this measure" onClick={() => set({ measures: spec.measures.filter((_, k) => k !== i), sort: '' })}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            {spec.measures.length < 4 && numbers.length > 0 && (
              <button type="button" className="rpm-link" onClick={() => set({ measures: [...spec.measures, { fn: 'sum', column: numbers[0].name }], sort: '' })}>
                + Add a measure
              </button>
            )}
          </div>
        )}

        {!spec.groupBy && (
          <div className="rpm-section">
            <span className="rpm-label">Show only these columns (none picked = all)</span>
            <div className="rpm-chips">
              {meta.columns.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={spec.columns.includes(c.name)}
                  onClick={() => set({ columns: spec.columns.includes(c.name) ? spec.columns.filter((x) => x !== c.name) : [...spec.columns, c.name], sort: '' })}
                >
                  {label(c.name)}
                </button>
              ))}
            </div>
          </div>
        )}
      </details>
    </details>
  )
}

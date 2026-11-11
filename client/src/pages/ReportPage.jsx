import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getReportOptions, getReportParams, listQueries, reportDetail, runQuery, runReport } from '../api/index.js'
import ReportDetail from '../components/ReportDetail.jsx'
import { useAuth } from '../auth/context.js'
import DataTable from '../components/DataTable.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import ReportParams, { emptySpec, isCustom, toRequest } from '../components/ReportParams.jsx'
import { makeLabeler } from '../config/labels.js'
import { REPORTS } from '../config/reports.js'
import NotFound from './NotFound.jsx'
import './ReportPage.css'

// chart = { type, x, y, y2?, yLabel?, y2Label?, angle? } (see config/reports.js)
function Chart({ chart, rows, label }) {
  if (!chart || rows.length === 0) return null
  const Plot = chart.type === 'line' ? LineChart : BarChart
  const angled = Boolean(chart.angle)
  const axisProps = angled ? { angle: -40, textAnchor: 'end', height: 90, interval: 0 } : {}
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={angled ? 380 : 320}>
        <Plot data={rows}>
          <CartesianGrid stroke="#d5e1dd" strokeDasharray="3 3" />
          <XAxis dataKey={chart.x} tick={{ fill: '#4a6663', fontSize: 12 }} {...axisProps} />
          <YAxis tick={{ fill: '#4a6663', fontSize: 12 }} />
          <Tooltip />
          {chart.y2 && <Legend verticalAlign="top" />}
          {chart.type === 'line' ? (
            <>
              <Line type="monotone" dataKey={chart.y} name={chart.yLabel ?? label(chart.y)} stroke="#f26b4f" strokeWidth={3} dot={false} />
              {chart.y2 && <Line type="monotone" dataKey={chart.y2} name={chart.y2Label ?? label(chart.y2)} stroke="#1c9aa8" strokeWidth={2} dot={false} />}
            </>
          ) : (
            <>
              <Bar dataKey={chart.y} name={chart.yLabel ?? label(chart.y)} fill="#1c9aa8" radius={[3, 3, 0, 0]} />
              {chart.y2 && <Bar dataKey={chart.y2} name={chart.y2Label ?? label(chart.y2)} fill="#f2b14f" radius={[3, 3, 0, 0]} />}
            </>
          )}
        </Plot>
      </ResponsiveContainer>
    </div>
  )
}

// A report's own functions should never be able to blank the whole page.
function safely(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// One CSV cell: quote it when needed, and defuse text a spreadsheet would run as a formula (=, +, @, or a '-' that is not a number).
function csvCell(v) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && (/^[=+@]/.test(s) || (/^-/.test(s) && !Number.isFinite(Number(s))))) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Download the rows as a .csv file (opens in Excel / LibreOffice Calc).
function downloadCsv(name, columns, rows, label) {
  const lines = [columns.map((c) => csvCell(label(c))).join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// The inputs for a query tab, drawn from the parameter list the server sends: the start and end dates become one
// click-to-pick date range, a parameter with `choices` becomes a drop-down, a text parameter is a search box, and any other number is a number box.
function QueryInputs({ params, values, onChange, onEnter }) {
  const set = (name, value) => onChange((v) => ({ ...v, [name]: value }))
  const hasDates = params.some((p) => p.name === 'start') && params.some((p) => p.name === 'end')
  return (
    <>
      {params
        .filter((p) => p.type !== 'date')
        .map((p) => (
          <label key={p.name} className="rp-datepick">
            <span>{p.label}</span>
            {p.type === 'text' ? (
              <>
                <input
                  type="search"
                  className="rp-search"
                  maxLength={60}
                  list={`rp-names-${p.name}`}
                  placeholder={p.placeholder ?? 'Type part of a name, or pick one'}
                  value={values[p.name] ?? ''}
                  onChange={(e) => set(p.name, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
                />
                <datalist id={`rp-names-${p.name}`}>
                  {(p.suggestions ?? []).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </>
            ) : Array.isArray(p.choices) ? (
              <select value={values[p.name] ?? p.default} onChange={(e) => set(p.name, Number(e.target.value))}>
                {p.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input type="number" min="0" value={values[p.name] ?? ''} onChange={(e) => set(p.name, e.target.value)} />
            )}
          </label>
        ))}
      {hasDates && (
        <div className="rp-datepick">
          <span>Dates</span>
          <DateRangePicker
            label="Dates"
            from={values.start ?? ''}
            to={values.end ?? ''}
            onChange={({ from, to }) => onChange((v) => ({ ...v, start: from || params.find((p) => p.name === 'start').default, end: to || params.find((p) => p.name === 'end').default }))}
          />
        </div>
      )}
    </>
  )
}

// The body of one report or one section: filters, headline numbers, notes, charts and table.
// `report` is either a whole report or one entry of report.sections (both use the same settings, see config/reports.js).
// Columns that start on the Search options panel as ready-to-use filters: the report's own choice (`featured`), otherwise the
// first few columns it already offers as drop-downs. The date range and the name search box live next to Run report instead.
function featuredColumns(report, meta) {
  const wanted = report.featured ?? (report.filters ?? []).map((f) => f.key)
  return wanted.filter((k) => k !== report.dateFilter?.key && k !== report.search?.key && meta.columns.some((c) => c.name === k)).slice(0, 3)
}

function ReportBody({ report, csvName }) {
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false) // nothing is fetched until the user presses Run report
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selects, setSelects] = useState({}) // filter key -> chosen value ('' = all); only for columns the database does not have (see localKeys)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [meta, setMeta] = useState(null) // the columns a person can choose parameters on; null in mock mode or if it cannot be loaded
  const [spec, setSpec] = useState(() => emptySpec(null)) // parameters chosen before running (sent to the server)
  const [ranCustom, setRanCustom] = useState(false) // the last run was a summary or a column choice
  const [ranRequest, setRanRequest] = useState('')
  // A tab with `query: 'q1'` runs one of the SQL files in SQL/queries instead of a view. Its parameters come from the server.
  const isQuery = Boolean(report.query)
  const [queryDef, setQueryDef] = useState(null) // { id, title, params: [{ name, label, type, default, choices? }] }
  const [qvals, setQvals] = useState({}) // parameter name -> chosen value
  const [searchText, setSearchText] = useState('') // the name search when the database cannot do it (mock mode); otherwise it lives in spec.filters
  const label = useMemo(() => makeLabeler(report.labels), [report.labels])
  const [names, setNames] = useState([]) // the names offered in the search box's drop-down
  const [detail, setDetail] = useState(null) // { key, loading, error, data } for the open Details row

  // The list of columns is cheap (no report data is read), so it loads when the report opens.
  // The report itself still loads only when Run report is pressed.
  useEffect(() => {
    let live = true
    if (isQuery) {
      listQueries()
        .then((list) => {
          const def = list.find((q) => q.id === report.query)
          if (!live || !def) return
          setQueryDef(def)
          setQvals(Object.fromEntries(def.params.map((p) => [p.name, p.default])))
        })
        .catch((err) => {
          if (live) setError(err.message)
        })
      return () => {
        live = false
      }
    }
    getReportParams(report.endpoint)
      .then((m) => {
        if (!live || !m) return
        setMeta(m)
        setSpec(emptySpec(m, featuredColumns(report, m)))
      })
      .catch(() => {}) // no parameter panel; the report still runs with the old behaviour
    return () => {
      live = false
    }
  }, [report, isQuery])

  const columnNames = useMemo(() => new Set((meta?.columns ?? []).map((c) => c.name)), [meta])
  const dateKey = report.dateFilter?.key
  // The date picker next to Run report sends its range to the database when that column exists there.
  const dateOnServer = Boolean(meta) && Boolean(dateKey) && meta.columns.some((c) => c.name === dateKey && c.kind === 'date')
  // The name search box next to Run report. It is a "contains" filter on one text column, sent to the server like any other
  // filter (a bound LIKE, never pasted into the SQL). Without a database (mock mode) the loaded rows are searched instead.
  const searchKey = report.search?.key
  const searchOnServer = Boolean(meta) && Boolean(searchKey) && meta.columns.some((c) => c.name === searchKey && c.kind === 'text')
  const searchValue = searchOnServer ? (spec.filters.find((f) => f.column === searchKey)?.contains ?? '') : searchText
  useEffect(() => {
    if (!searchOnServer) return undefined
    let live = true
    getReportOptions(report.endpoint, searchKey, true)
      .then((r) => live && setNames(r.values ?? []))
      .catch(() => {}) // no drop-down; typing still works
    return () => {
      live = false
    }
  }, [report.endpoint, searchKey, searchOnServer])
  const nameList = useMemo(() => {
    const local = searchKey && !searchOnServer ? [...new Set(rows.map((r) => r[searchKey]).filter(Boolean))].sort() : names
    return local
  }, [names, rows, searchKey, searchOnServer])
  function typeSearch(text) {
    if (!searchOnServer) {
      setSearchText(text)
      return
    }
    const others = spec.filters.filter((f) => f.column !== searchKey)
    setSpec({ ...spec, filters: text ? [...others, { column: searchKey, kind: 'text', values: [], contains: text }] : others })
  }
  const serverDate = dateOnServer ? spec.filters.find((f) => f.column === dateKey) : null
  const pickFrom = dateOnServer ? (serverDate?.from ?? '') : from
  const pickTo = dateOnServer ? (serverDate?.to ?? '') : to
  // Drop-downs on columns the view does not have (the page works them out, for example Month) still work on the loaded rows.
  const localKeys = useMemo(() => (report.filters ?? []).filter((f) => !columnNames.has(f.key)), [report, columnNames])

  function pickDates({ from: f, to: t }) {
    if (!dateOnServer) {
      setFrom(f)
      setTo(t)
      return
    }
    const others = spec.filters.filter((x) => x.column !== dateKey)
    setSpec({ ...spec, filters: f || t ? [...others, { column: dateKey, kind: 'date', from: f, to: t }] : others })
  }

  // Only the Run report button fetches. A newer press makes an older, slower answer be ignored. The component is remounted
  // per report and tab, so a report you switch away from starts empty again and loads nothing until you press the button.
  const latest = useRef(0)
  const detailReq = useRef(0)
  function detailTitle(row) {
    const cols = (!ranCustom && report.columns) || Object.keys(row)
    return cols
      .filter((c) => c !== 'Note' && !String(c).startsWith('_') && row[c] !== null && row[c] !== undefined && row[c] !== '')
      .slice(0, 4)
      .map((c) => `${label(c)} ${row[c]}`)
      .join(' · ')
  }
  function detailRange() {
    let saved = null
    try {
      saved = JSON.parse(ranRequest)
    } catch {
      saved = null
    }
    if (isQuery) return { from: saved?.start || '', to: saved?.end || '' }
    if (dateOnServer) {
      const hit = (saved?.filters ?? []).find((f) => f.column === dateKey)
      return { from: hit?.from || '', to: hit?.to || '' }
    }
    return { from, to }
  }
  function openDetail(row) {
    const key = JSON.stringify(row)
    if (detail?.key === key) {
      setDetail(null)
      return
    }
    const id = report.endpoint || report.query
    const mine = ++detailReq.current
    setDetail({ key, title: detailTitle(row), loading: true, error: '', data: null })
    reportDetail(id, row, detailRange())
      .then((data) => {
        if (mine === detailReq.current) setDetail({ key, title: detailTitle(row), loading: false, error: '', data })
      })
      .catch((err) => {
        if (mine === detailReq.current) setDetail({ key, title: detailTitle(row), loading: false, error: err.message, data: null })
      })
  }
  function run() {
    const mine = ++latest.current
    const request = isQuery ? qvals : meta ? toRequest(spec) : undefined
    const custom = !isQuery && Boolean(meta) && isCustom(spec)
    setLoading(true)
    setError('')
    setDetail(null)
    ;(isQuery ? runQuery(report.query, qvals) : runReport(report.endpoint, request))
      .then(({ rows: data }) => {
        if (mine !== latest.current) return
        setRows(report.prepare && !custom ? report.prepare(data) : data)
        setRanCustom(custom)
        setRanRequest(JSON.stringify(request ?? null))
        setLoaded(true)
      })
      .catch((err) => {
        if (mine === latest.current) setError(err.message)
      })
      .finally(() => {
        if (mine === latest.current) setLoading(false)
      })
  }

  const stale = loaded && (isQuery ? JSON.stringify(qvals) !== ranRequest : Boolean(meta) && JSON.stringify(toRequest(spec)) !== ranRequest)

  // Values for each drop-down, taken from the rows themselves.
  const options = useMemo(() => {
    const out = {}
    for (const f of localKeys) {
      out[f.key] = [...new Set(rows.map((r) => r[f.key]).filter((v) => v !== null && v !== undefined))].map(String).sort()
    }
    return out
  }, [rows, localKeys])

  const useLocal = !ranCustom // a summary has different columns, so the page-side filters do not apply to it
  const localDate = useLocal && report.dateFilter && !dateOnServer
  const filtered = useMemo(
    () =>
      useLocal
        ? rows.filter((r) => {
            for (const f of localKeys) {
              const chosen = selects[f.key]
              if (chosen && String(r[f.key]) !== chosen) return false
            }
            if (localDate) {
              const day = String(r[report.dateFilter.key]).slice(0, 10)
              if (from && day < from) return false
              if (to && day > to) return false
            }
            if (searchKey && !searchOnServer && searchText.trim()) {
              if (!String(r[searchKey] ?? '').toLowerCase().includes(searchText.trim().toLowerCase())) return false
            }
            return true
          })
        : rows,
    [rows, selects, from, to, report, localKeys, useLocal, localDate, searchKey, searchOnServer, searchText],
  )

  // Days after today are Pre-ordered (tickets booked ahead). They stay out of every total, average and chart,
  // and only a report with showPreOrdered lists them (at the top of the table, marked Pre-ordered).
  const actual = useMemo(() => (ranCustom ? filtered : filtered.filter((r) => !Number(r.PreOrdered))), [filtered, ranCustom])
  const preOrdered = useMemo(
    () => (ranCustom ? [] : filtered.filter((r) => Number(r.PreOrdered)).map((r) => ({ ...r, Note: 'Pre-ordered', _mark: undefined }))),
    [filtered, ranCustom],
  )
  const kpis = !ranCustom && report.kpis ? safely(() => report.kpis(actual), []) : []
  const insights = !ranCustom && report.insights ? safely(() => report.insights(actual), []) : []
  const notes = ranCustom ? [] : [...insights, ...(report.notes ?? [])]
  const chartRows = ranCustom ? [] : report.chartRows ? safely(() => report.chartRows(actual), []) : actual
  const extra = ranCustom ? null : report.extraChart
  const extraRows = extra ? safely(() => extra.rows(actual), []) : []
  // tableRows lets a report show a summary (one row per month, venue, item...) instead of the raw rows.
  const baseRows = !ranCustom && report.tableRows ? safely(() => report.tableRows(actual), []) : actual
  const tableRows =
    !ranCustom && report.showPreOrdered
      ? [...[...preOrdered].sort((a, b) => String(b.VisitDate).localeCompare(String(a.VisitDate))), ...baseRows]
      : baseRows
  const hasFilters = localKeys.length > 0
  const filtersOn = localKeys.some((f) => selects[f.key]) || (localDate && (from || to)) || (!searchOnServer && searchKey && searchText.trim() !== '')

  return (
    <div>
      {report.sectionDescription && <p className="muted rp-section-desc">{report.sectionDescription}</p>}
      <ErrorBanner message={error} onClose={() => setError('')} />
      <div className="rp-runbar">
        {report.search && !isQuery && (
          <label className="rp-datepick">
            <span>{report.search.label}</span>
            <input
              type="search"
              className="rp-search"
              maxLength={60}
              placeholder={report.search.placeholder ?? 'Type part of a name, or pick one'}
              list={`rp-names-${csvName}`}
              value={searchValue}
              onChange={(e) => typeSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
            />
            <datalist id={`rp-names-${csvName}`}>
              {nameList.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        )}
        {isQuery && queryDef && <QueryInputs params={queryDef.params} values={qvals} onChange={setQvals} onEnter={() => !loading && run()} />}
        {report.dateFilter && (
          <div className="rp-datepick">
            <span>{report.dateFilter.label}</span>
            <DateRangePicker label={report.dateFilter.label} from={pickFrom} to={pickTo} onChange={pickDates} />
          </div>
        )}
        <button type="button" className="btn-primary rp-run" onClick={run} disabled={loading}>
          {loading ? 'Running…' : loaded ? 'Run again' : 'Run report'}
        </button>
        {!loaded && !loading && !error && <span className="muted">Choose your search options, then press Run report to load the data.</span>}
        {stale && !loading && <span className="muted">Search options changed. Press Run again to update.</span>}
      </div>
      {!isQuery && <ReportParams
          endpoint={report.endpoint}
          meta={meta}
          spec={spec}
          onChange={setSpec}
          label={label}
          hideColumn={[dateOnServer ? dateKey : '', searchOnServer ? searchKey : '']}
        />}
      {loaded && (
        <>
          {(hasFilters || filtersOn) && (
            <div className="rp-filters">
              {localKeys.map((f) => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <select value={selects[f.key] ?? ''} onChange={(e) => setSelects((s) => ({ ...s, [f.key]: e.target.value }))}>
                    <option value="">All</option>
                    {(options[f.key] ?? []).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {filtersOn && (
                <button
                  type="button"
                  className="rp-clear"
                  onClick={() => {
                    setSelects({})
                    setFrom('')
                    setTo('')
                    setSearchText('')
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {ranCustom && <p className="muted">Custom result: a summary or a column choice, so the report&apos;s own charts and headline numbers are left out.</p>}

          {kpis.length > 0 && (
            <div className="rp-kpis">
              {kpis.map((k) => (
                <div className="rp-kpi" key={k.label}>
                  <span className="rp-kpi-label">{k.label}</span>
                  <strong className="rp-kpi-value">{k.value}</strong>
                  {k.note && <span className="rp-kpi-note">{k.note}</span>}
                </div>
              ))}
            </div>
          )}

          {notes.length > 0 && (
            <div className="rp-notes">
              <strong>What the numbers mean</strong>
              <ul>
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {!ranCustom && report.summary && <p className="summary">{safely(() => report.summary(actual), '')}</p>}
          {!ranCustom && <Chart chart={report.chart} rows={chartRows} label={label} />}
          {extra && extraRows.length > 0 && (
            <>
              <h3 className="rp-chart-title">{extra.title}</h3>
              <Chart chart={extra.chart} rows={extraRows} label={label} />
            </>
          )}
          <div className="rp-actions">
            <span className="muted">{tableRows.length.toLocaleString('en-US')} rows</span>
            <button
              type="button"
              className="rp-export"
              disabled={tableRows.length === 0}
              onClick={() => downloadCsv(csvName, (!ranCustom && report.columns) || Object.keys(tableRows[0]), tableRows, label)}
            >
              Download CSV
            </button>
          </div>
          <DataTable
            key={csvName}
            rows={tableRows}
            columns={ranCustom ? undefined : report.columns}
            rowClass={ranCustom ? undefined : report.rowClass}
            pageSize={10}
            labelOf={label}
            onDetail={report.endpoint || report.query ? openDetail : undefined}
            detailKey={detail?.key ?? null}
            detailSlot={detail ? <ReportDetail state={detail} onClose={() => setDetail(null)} /> : null}
          />
        </>
      )}
    </div>
  )
}

// One page for EVERY report: it looks up its settings in config/reports.js.
// A report with `sections` shows one tab per section (each with its own data, filters and chart); the others show a single body.
// `reportKey` lets the one-page admin show a report in place. Without it the key comes from the URL (/reports/:key).
export default function ReportPage({ reportKey }) {
  const params = useParams()
  const key = reportKey ?? params.key
  const { user } = useAuth()
  const report = REPORTS.find((r) => r.key === key)
  const allowed = Boolean(report) && (!report.roles || report.roles.includes(user.role))
  const [tab, setTab] = useState('')

  if (!report) return <NotFound />
  if (!allowed) return <p className="page-note">Your role ({user.role}) cannot open this report.</p>

  const sections = report.sections ?? null
  const active = sections ? (sections.find((s) => s.key === tab) ?? sections[0]) : report

  return (
    <div>
      <h1>{report.title}</h1>
      <p className="muted">{report.description}</p>
      {sections && (
        <div className="rp-tabs" role="tablist">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              className="rp-tab"
              aria-selected={s.key === active.key}
              onClick={() => setTab(s.key)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      <ReportBody key={`${report.key}/${active.key}`} report={active} csvName={sections ? `${report.key}-${active.key}` : report.key} />
    </div>
  )
}

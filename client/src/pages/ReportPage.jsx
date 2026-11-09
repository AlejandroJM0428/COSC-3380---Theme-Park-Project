import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getReportParams, runReport } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import DataTable from '../components/DataTable.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import ReportParams, { emptySpec, isCustom, toRequest } from '../components/ReportParams.jsx'
import ReportSql from '../components/ReportSql.jsx'
import { REPORTS } from '../config/reports.js'
import NotFound from './NotFound.jsx'
import './ReportPage.css'

// chart = { type, x, y, y2?, yLabel?, y2Label?, angle? } (see config/reports.js)
function Chart({ chart, rows }) {
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
              <Line type="monotone" dataKey={chart.y} name={chart.yLabel ?? chart.y} stroke="#f26b4f" strokeWidth={3} dot={false} />
              {chart.y2 && <Line type="monotone" dataKey={chart.y2} name={chart.y2Label ?? chart.y2} stroke="#1c9aa8" strokeWidth={2} dot={false} />}
            </>
          ) : (
            <>
              <Bar dataKey={chart.y} name={chart.yLabel ?? chart.y} fill="#1c9aa8" radius={[3, 3, 0, 0]} />
              {chart.y2 && <Bar dataKey={chart.y2} name={chart.y2Label ?? chart.y2} fill="#f2b14f" radius={[3, 3, 0, 0]} />}
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
function downloadCsv(name, columns, rows) {
  const lines = [columns.map(csvCell).join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))]
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

// The body of one report or one section: filters, headline numbers, notes, charts and table.
// `report` is either a whole report or one entry of report.sections (both use the same settings, see config/reports.js).
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
  const [evidence, setEvidence] = useState(null) // the SQL that ran, and its proof
  const [ranCustom, setRanCustom] = useState(false) // the last run was a summary or a column choice
  const [ranRequest, setRanRequest] = useState('')

  // The list of columns is cheap (no report data is read), so it loads when the report opens.
  // The report itself still loads only when Run report is pressed.
  useEffect(() => {
    let live = true
    getReportParams(report.endpoint)
      .then((m) => {
        if (!live || !m) return
        setMeta(m)
        setSpec(emptySpec(m))
      })
      .catch(() => {}) // no parameter panel; the report still runs with the old behaviour
    return () => {
      live = false
    }
  }, [report.endpoint])

  const columnNames = useMemo(() => new Set((meta?.columns ?? []).map((c) => c.name)), [meta])
  const dateKey = report.dateFilter?.key
  // The date picker next to Run report sends its range to the database when that column exists there.
  const dateOnServer = Boolean(meta) && Boolean(dateKey) && meta.columns.some((c) => c.name === dateKey && c.kind === 'date')
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
  function run() {
    const mine = ++latest.current
    const request = meta ? toRequest(spec) : undefined
    const custom = Boolean(meta) && isCustom(spec)
    setLoading(true)
    setError('')
    runReport(report.endpoint, request)
      .then(({ rows: data, evidence: proof }) => {
        if (mine !== latest.current) return
        setRows(report.prepare && !custom ? report.prepare(data) : data)
        setEvidence(proof)
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

  const stale = loaded && meta && JSON.stringify(toRequest(spec)) !== ranRequest

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
            return true
          })
        : rows,
    [rows, selects, from, to, report, localKeys, useLocal, localDate],
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
  const filtersOn = localKeys.some((f) => selects[f.key]) || (localDate && (from || to))

  // Anything the page did to the rows after the SQL, so the "How this was calculated" box can say so.
  const after = []
  if (useLocal) {
    for (const f of localKeys) if (selects[f.key]) after.push(`${f.label} = ${selects[f.key]}`)
    if (localDate && (from || to)) after.push(`${report.dateFilter.label} ${from || '…'} to ${to || '…'}`)
  }
  if (!ranCustom && report.prepare) after.push('added calculated columns such as Month, and turned money text into numbers')

  return (
    <div>
      {report.sectionDescription && <p className="muted rp-section-desc">{report.sectionDescription}</p>}
      <ErrorBanner message={error} onClose={() => setError('')} />
      <div className="rp-runbar">
        {report.dateFilter && (
          <div className="rp-datepick">
            <span>{report.dateFilter.label}</span>
            <DateRangePicker label={report.dateFilter.label} from={pickFrom} to={pickTo} onChange={pickDates} />
          </div>
        )}
        <button type="button" className="btn-primary rp-run" onClick={run} disabled={loading}>
          {loading ? 'Running…' : loaded ? 'Run again' : 'Run report'}
        </button>
        {!loaded && !loading && !error && <span className="muted">Choose parameters, then press Run report to load the data.</span>}
        {stale && !loading && <span className="muted">Parameters changed. Press Run again to update.</span>}
      </div>
      <ReportParams endpoint={report.endpoint} meta={meta} spec={spec} onChange={setSpec} hideColumn={dateOnServer ? dateKey : ''} />
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
          {!ranCustom && <Chart chart={report.chart} rows={chartRows} />}
          {extra && extraRows.length > 0 && (
            <>
              <h3 className="rp-chart-title">{extra.title}</h3>
              <Chart chart={extra.chart} rows={extraRows} />
            </>
          )}
          <ReportSql evidence={evidence} after={after} />
          <div className="rp-actions">
            <span className="muted">{tableRows.length.toLocaleString('en-US')} rows</span>
            <button
              type="button"
              className="rp-export"
              disabled={tableRows.length === 0}
              onClick={() => downloadCsv(csvName, (!ranCustom && report.columns) || Object.keys(tableRows[0]), tableRows)}
            >
              Download CSV
            </button>
          </div>
          <DataTable key={csvName} rows={tableRows} columns={ranCustom ? undefined : report.columns} rowClass={ranCustom ? undefined : report.rowClass} pageSize={10} />
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

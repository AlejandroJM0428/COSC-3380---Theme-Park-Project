import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getReport } from '../api/index.js'
import { useAuth } from '../auth/context.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selects, setSelects] = useState({}) // filter key -> chosen value ('' = all)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    let cancelled = false // ignore a slow response if the user already switched tabs (this component is remounted per report and tab, so state starts fresh)
    getReport(report.endpoint)
      .then((data) => {
        if (!cancelled) setRows(report.prepare ? report.prepare(data) : data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [report])

  // Values for each drop-down, taken from the rows themselves.
  const options = useMemo(() => {
    const out = {}
    for (const f of report.filters ?? []) {
      out[f.key] = [...new Set(rows.map((r) => r[f.key]).filter((v) => v !== null && v !== undefined))].map(String).sort()
    }
    return out
  }, [rows, report])

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        for (const f of report.filters ?? []) {
          const chosen = selects[f.key]
          if (chosen && String(r[f.key]) !== chosen) return false
        }
        if (report.dateFilter) {
          const day = String(r[report.dateFilter.key]).slice(0, 10)
          if (from && day < from) return false
          if (to && day > to) return false
        }
        return true
      }),
    [rows, selects, from, to, report],
  )

  const kpis = report.kpis ? safely(() => report.kpis(filtered), []) : []
  const insights = report.insights ? safely(() => report.insights(filtered), []) : []
  const notes = [...insights, ...(report.notes ?? [])]
  const chartRows = report.chartRows ? safely(() => report.chartRows(filtered), []) : filtered
  const extra = report.extraChart
  const extraRows = extra ? safely(() => extra.rows(filtered), []) : []
  // tableRows lets a report show a summary (one row per month, venue, item...) instead of the raw rows.
  const tableRows = report.tableRows ? safely(() => report.tableRows(filtered), []) : filtered
  const hasFilters = (report.filters?.length ?? 0) > 0 || Boolean(report.dateFilter)
  const filtersOn = Object.values(selects).some(Boolean) || from || to

  return (
    <div>
      {report.sectionDescription && <p className="muted rp-section-desc">{report.sectionDescription}</p>}
      <ErrorBanner message={error} onClose={() => setError('')} />
      {loading ? (
        <p className="muted">Loading report…</p>
      ) : (
        <>
          {hasFilters && (
            <div className="rp-filters">
              {(report.filters ?? []).map((f) => (
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
              {report.dateFilter && (
                <>
                  <label>
                    <span>{report.dateFilter.label} from</span>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label>
                    <span>to</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </label>
                </>
              )}
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

          {report.summary && <p className="summary">{safely(() => report.summary(filtered), '')}</p>}
          <Chart chart={report.chart} rows={chartRows} />
          {extra && extraRows.length > 0 && (
            <>
              <h3 className="rp-chart-title">{extra.title}</h3>
              <Chart chart={extra.chart} rows={extraRows} />
            </>
          )}
          <div className="rp-actions">
            <span className="muted">{tableRows.length.toLocaleString('en-US')} rows</span>
            <button
              type="button"
              className="rp-export"
              disabled={tableRows.length === 0}
              onClick={() => downloadCsv(csvName, report.columns ?? Object.keys(tableRows[0]), tableRows)}
            >
              Download CSV
            </button>
          </div>
          <DataTable key={csvName} rows={tableRows} columns={report.columns} rowClass={report.rowClass} />
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

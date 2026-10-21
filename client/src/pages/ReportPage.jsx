import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getReport } from '../api/index.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { REPORTS } from '../config/reports.js'
import NotFound from './NotFound.jsx'

function Chart({ chart, rows }) {
  if (!chart || rows.length === 0) return null
  const Plot = chart.type === 'line' ? LineChart : BarChart
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={320}>
        <Plot data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.x} />
          <YAxis />
          <Tooltip />
          {chart.type === 'line' ? (
            <Line type="monotone" dataKey={chart.y} stroke="#4f46e5" />
          ) : (
            <Bar dataKey={chart.y} fill="#4f46e5" />
          )}
        </Plot>
      </ResponsiveContainer>
    </div>
  )
}

// One page for EVERY report: it looks up its settings in config/reports.js.
export default function ReportPage() {
  const { key } = useParams()
  const report = REPORTS.find((r) => r.key === key)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!report) return undefined
    let cancelled = false // ignore a slow response if the user already switched reports
    setLoading(true)
    setError('')
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

  if (!report) return <NotFound />

  return (
    <div>
      <h1>{report.title}</h1>
      <p className="muted">{report.description}</p>
      {report.pending && (
        <p className="page-note">Heads up: this report needs a new database view ({report.view}).</p>
      )}
      <ErrorBanner message={error} onClose={() => setError('')} />
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {report.summary && <p className="summary">{report.summary(rows)}</p>}
          <Chart chart={report.chart} rows={rows} />
          <DataTable rows={rows} />
        </>
      )}
    </div>
  )
}

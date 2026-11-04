import { useEffect, useState } from 'react'
import { getMyWork } from '../api/index.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const day = (s) => (s ? String(s).slice(0, 16) : '—')
const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`)

// Employee portal: read-only view of the logged-in worker's own hours, pay, shifts, ratings and jobs. No revenue.
export default function MyWork() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('jobs')

  useEffect(() => {
    let alive = true
    getMyWork()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!data) return <p className="muted">Loading…</p>
  if (!data.linked) {
    return <p className="page-note">This login is not linked to an employee record yet. Ask an administrator.</p>
  }

  const shifts = data.shifts.map((s) => ({
    Start: day(s.ClockIn),
    End: s.ClockOut ? day(s.ClockOut) : 'On shift',
    Hours: s.HoursWorked ?? '—',
    Pay: s.Pay === null || s.Pay === undefined ? '—' : money(s.Pay),
    Rating: s.ShiftRating ?? '—',
    Notes: s.ShiftNotes ?? '—',
  }))

  // Repair jobs and shifts are two separate histories, shown one at a time. Workers with no repair jobs (restaurant) only have shifts.
  const hasJobs = Boolean(data.jobs)
  const shown = hasJobs ? tab : 'shifts'

  return (
    <div>
      <h1>My work</h1>
      <p>
        {data.employee.Name} · {data.employee.JobTitle} · Hired on: {data.employee.HireDate} · Hourly pay: {money(data.employee.HourlyPay)}
      </p>

      {hasJobs && (
        <div className="mywork-tabs" role="tablist" aria-label="My work history">
          <button type="button" role="tab" aria-selected={shown === 'jobs'} className={shown === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>
            Repair job history
          </button>
          <button type="button" role="tab" aria-selected={shown === 'shifts'} className={shown === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}>
            Shift history
          </button>
        </div>
      )}

      {shown === 'jobs' ? (
        <>
          <h2>Repair job history</h2>
          <DataTable
            rows={data.jobs.map((j) => ({
              'Job #': j.MaintenanceID,
              Where: j.FacilityName,
              Type: j.MaintType,
              'My role': j.CrewRole,
              Started: day(j.StartDate),
              Closed: j.EndDate ? day(j.EndDate) : 'Open',
              Outcome: j.Outcome ?? '—',
            }))}
          />
        </>
      ) : (
        <>
          <h2>Shift history</h2>
          <DataTable rows={shifts} />
        </>
      )}
    </div>
  )
}

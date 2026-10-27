import { useEffect, useState } from 'react'
import { getMyWork } from '../api/index.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (s) => (s ? String(s).slice(0, 16) : '—')
const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`)

// Employee portal: read-only view of the logged-in worker's own shifts, jobs or restaurant sales.
export default function MyWork() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

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
    Rating: s.ShiftRating ?? '—',
    Notes: s.ShiftNotes ?? '—',
  }))

  return (
    <div>
      <h1>My work</h1>
      <p>
        {data.employee.Name} · {data.employee.JobTitle}
      </p>

      {data.jobs && (
        <>
          <h2>My repair jobs</h2>
          <DataTable
            rows={data.jobs.map((j) => ({
              'Job #': j.MaintenanceID,
              Where: j.FacilityName,
              Type: j.MaintType,
              'My role': j.CrewRole,
              Started: day(j.StartDate),
              Closed: j.EndDate ? day(j.EndDate) : 'Open',
              Outcome: j.Outcome ?? '—',
              'Repair cost': money(j.RepairCost),
            }))}
          />
        </>
      )}

      {data.sales && (
        <>
          <h2>Restaurant sales (all restaurants)</h2>
          <DataTable
            rows={data.sales.map((s) => ({
              Restaurant: s.VenueName,
              Month: `${MONTHS[s.SaleMonth - 1]} ${s.SaleYear}`,
              Orders: s.Orders,
              Units: s.Units,
              Revenue: money(s.Revenue),
            }))}
          />
        </>
      )}

      <h2>My recent shifts</h2>
      <DataTable rows={shifts} />
    </div>
  )
}

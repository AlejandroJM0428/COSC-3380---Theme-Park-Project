import { useEffect, useState } from 'react'
import { getMyWork, reportJobFinished, undoJobFinished } from '../api/index.js'
import DataTable from '../components/DataTable.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import './MyWork.css'

const day = (s) => (s ? String(s).slice(0, 16) : '—')
const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`)


const OUTCOMES = ['Fixed', 'Partially Fixed', 'Not Fixed']

// One open repair job the worker is on the crew of. The worker can report the work finished (with how it went and a short note)
// or undo that report. Only the maintenance manager closes the job, because closing needs the repair cost.
function OpenJob({ job, onChanged, onError }) {
  const [outcome, setOutcome] = useState('Fixed')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    onError('')
    try {
      await action()
      await onChanged()
    } catch (err) {
      onError(err.message) // trigger text from the database shows here
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="panel mw-job">
      <div>
        <strong>{job.FacilityName}</strong> · {job.MaintType} · started {day(job.StartDate)} · you are the {job.CrewRole.toLowerCase()}
        <span className="muted mw-reason">{job.Reason}</span>
      </div>
      {job.ReportOutcome ? (
        <div className="mw-reported">
          <span>
            Reported finished ({job.ReportOutcome.toLowerCase()}) on {day(job.ReportedAt)}
            {job.ReportedBy ? ` by ${job.ReportedBy}` : ''}. Waiting for the maintenance manager to close it.
            {job.ReportNote ? ` Note: ${job.ReportNote}` : ''}
          </span>
          <button type="button" disabled={busy} onClick={() => run(() => undoJobFinished(job.MaintenanceID))}>
            Undo report
          </button>
        </div>
      ) : (
        <div className="mw-form">
          <label>
            How did it go?
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {OUTCOMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="mw-note">
            Note for the manager (optional)
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => run(() => reportJobFinished(job.MaintenanceID, { outcome, note }))}>
            {busy ? 'Saving…' : 'Mark work finished'}
          </button>
        </div>
      )}
    </li>
  )
}

// Employee portal: the logged-in worker's own hours, pay, shifts, ratings and jobs. No revenue or repair cost.
// A maintenance worker can also report the open jobs they are crew on as finished.
export default function MyWork() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [tab, setTab] = useState('jobs')

  const load = () => getMyWork().then(setData).catch((err) => setError(err.message))

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
  const openJobs = (data.jobs ?? []).filter((j) => !j.EndDate)
  const shown = hasJobs ? tab : 'shifts'

  return (
    <div>
      <h1>My work</h1>
      <p>
        {data.employee.Name} · {data.employee.JobTitle} · Hired on: {data.employee.HireDate} · Hourly pay: {money(data.employee.HourlyPay)}
      </p>

      {hasJobs && (
        <>
          <h2>Open jobs</h2>
          {openJobs.length === 0 ? (
            <p className="muted">You are not on the crew of any open job right now.</p>
          ) : (
            <ul className="mw-jobs">
              {openJobs.map((j) => (
                <OpenJob key={j.MaintenanceID} job={j} onChanged={load} onError={setActionError} />
              ))}
            </ul>
          )}
          <ErrorBanner message={actionError} onClose={() => setActionError('')} />
        </>
      )}

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
            rows={data.jobs.filter((j) => j.EndDate).map((j) => ({
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

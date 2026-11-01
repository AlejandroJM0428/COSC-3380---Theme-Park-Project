import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const FILTERS = ['All', 'Open', 'Closed']

// Ride board: a dense table. Wait minutes show only when the server says waitsVisible (active membership);
// everyone else sees a Join prompt. Status text comes from the park's live ride status.
export default function RidesTab({ rides, waitsVisible, loading }) {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rides.filter((r) => (
      (filter === 'All' || (filter === 'Open' ? r.currentState === 'Open' : r.currentState !== 'Open'))
      && (!q || `${r.rideName} ${r.zoneName}`.toLowerCase().includes(q))
    ))
  }, [rides, filter, search])

  return (
    <section className="pt-card pt-flush">
      <div className="pt-toolbar">
        <div className="pt-seg" role="group" aria-label="Filter rides">
          {FILTERS.map((f) => <button type="button" key={f} className={f === filter ? 'active' : ''} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <label className="pt-search"><span className="sr-only">Search rides or zones</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rides or zones" /></label>
        <strong className="pt-muted" aria-live="polite">{shown.length} of {rides.length}</strong>
      </div>

      {!waitsVisible && <p className="pt-prompt">Members see live wait times. <Link to="/memberships">Join</Link></p>}

      <div className="pt-table-wrap">
        <table className="pt-table">
          <thead><tr><th scope="col">Ride</th><th scope="col">Zone</th><th scope="col">Status</th>{waitsVisible && <th scope="col" className="pt-num">Wait</th>}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.rideId}>
                <td><strong>{r.rideName}</strong></td>
                <td>{r.zoneName}</td>
                <td><span className={`pt-status ${r.currentState === 'Open' ? 'open' : 'closed'}`}>{r.currentState}</span></td>
                {waitsVisible && <td className="pt-num">{r.currentState === 'Open' && r.waitMinutes != null ? `${r.waitMinutes} min` : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && shown.length === 0 && <p className="pt-empty">No rides match those filters.</p>}
      <p className="pt-fine pt-pad">Status is the park’s live ride status.{waitsVisible ? ' Wait times are the latest posted reading, not a guarantee.' : ''}</p>
    </section>
  )
}

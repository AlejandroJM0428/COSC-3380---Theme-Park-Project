
import { useEffect, useState } from 'react'

import { getTicketTransactions } from '../api/index.js'

export default function TicketTransactions({ from, to }) {
  const [open, setOpen] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
  setOpen(false)
  setTransactions([])
  setError('')
  }, [from, to])

  async function loadTransactions() {
    if (open) {
      setOpen(false)
      return
    }

    setLoading(true)
    setError('')

    try {
     const data = await getTicketTransactions(from, to)
      setTransactions(data.transactions ?? [])
      setOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalRevenue = transactions.reduce(
    (sum, ticket) => sum + Number(ticket.TicketPrice),
    0
  )

  return (
    <div style={{ marginTop: 24 }}>
      <button
        type="button"
        className="btn-primary"
        onClick={loadTransactions}
        disabled={loading}
      >
        {loading
          ? 'Loading...'
          : open
            ? 'Hide Ticket Transactions'
            : 'View Ticket Transactions'}
      </button>

      {error && <p role="alert">{error}</p>}

      {open && (
        <div style={{ marginTop: 20 }}>
          <h3>Individual Ticket Sales</h3>

          <p>
            <strong>Tickets Sold:</strong> {transactions.length}
            {' | '}
            <strong>Total Revenue:</strong> ${totalRevenue.toFixed(2)}
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket ID</th>
                  <th>Customer ID</th>
                  <th>Purchase Date</th>
                  <th>Visit Date</th>
                  <th>Ticket Price</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((ticket) => (
                  <tr key={ticket.TicketID}>
                    <td>{ticket.TicketID}</td>
                    <td>{ticket.CustomerID}</td>
                    <td>{String(ticket.PurchaseDate).slice(0, 10)}</td>
                    <td>{String(ticket.VisitDate).slice(0, 10)}</td>
                    <td>${Number(ticket.TicketPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

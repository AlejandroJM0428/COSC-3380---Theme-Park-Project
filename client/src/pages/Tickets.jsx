import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { formatDate } from '../utils/portalFormat.js'

// TEMPORARY placeholder. Guest checkout is built in a later part and replaces this page.
// For now it shows what was chosen and sends members to sign in, so nothing is a dead end.
export default function Tickets() {
  const [params] = useSearchParams()
  const { user, ready } = useAuth()
  const date = params.get('date')
  const express = params.get('express') === '1'

  // Signed in already: no prompt. The portal's Tickets tab opens with the date and Express they picked.
  if (user?.role === 'Customer') {
    const next = new URLSearchParams({ tab: 'tickets' })
    if (date) next.set('date', date)
    if (express) next.set('express', '1')
    return <Navigate to={`/member?${next.toString()}`} replace />
  }
  if (!ready) return <div className="pub-page" aria-busy="true" />

  return (
    <div className="pub-page">
      <h1>Tickets</h1>
      {date ? <p>You chose <strong>{formatDate(date)}</strong>{express ? ' with Express' : ''}.</p> : null}
      <p>Checkout for guests is not available yet. Members can sign in now to buy tickets.</p>
      <p>
        <Link to="/member/login" className="pub-buy">Sign in to buy</Link>{' '}
        <Link to="/" className="pub-link">Back to home</Link>
      </p>
    </div>
  )
}

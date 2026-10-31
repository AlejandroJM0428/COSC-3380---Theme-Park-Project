import { Link, useSearchParams } from 'react-router-dom'
import { formatDate } from '../utils/portalFormat.js'

// TEMPORARY placeholder. Guest checkout is built in a later part and replaces this page.
// For now it shows what was chosen and sends members to sign in, so nothing is a dead end.
export default function Tickets() {
  const [params] = useSearchParams()
  const date = params.get('date')
  const express = params.get('express') === '1'

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

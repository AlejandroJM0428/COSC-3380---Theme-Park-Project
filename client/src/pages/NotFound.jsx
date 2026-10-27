import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p>
        <Link to="/staff">Back to the dashboard</Link>
      </p>
    </div>
  )
}

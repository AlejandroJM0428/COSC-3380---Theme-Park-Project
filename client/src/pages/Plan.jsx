import { Link } from 'react-router-dom'
import LoadError from '../components/LoadError.jsx'
import PlanTiles from '../components/home/PlanTiles.jsx'
import usePublicSite from '../hooks/usePublicSite.js'

// Placeholder "good to know" copy. Replace with real content later.
const GOOD_TO_KNOW = [
  { title: 'Parking', text: 'Parking details will be added here.' },
  { title: 'Accessibility', text: 'Accessibility information will be added here.' },
  { title: 'Lockers and first aid', text: 'Guest services details will be added here.' },
]

// Public "plan your visit" page (/plan).
export default function Plan() {
  const { site, error, retry } = usePublicSite()

  return (
    <main className="pub-page pub-page-wide">
      <h1 className="pub-h1">Plan your visit</h1>
      <p className="pub-lede">Hours, height rules and how to get here.</p>

      {error && <LoadError message={error} onRetry={retry} />}
      <PlanTiles hours={site?.hours} rides={site?.rides} bare />

      <h2 className="pub-h2 pub-h2-spaced">Good to know</h2>
      <div className="pub-plan">
        {GOOD_TO_KNOW.map((tile) => (
          <article key={tile.title}><h3>{tile.title}</h3><p>{tile.text}</p></article>
        ))}
      </div>

      <p className="pub-note"><Link to="/tickets" className="pub-link">Ready to go? Get tickets →</Link></p>
    </main>
  )
}

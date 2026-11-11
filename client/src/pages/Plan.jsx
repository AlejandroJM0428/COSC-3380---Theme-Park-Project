
import { Link } from 'react-router-dom'
import LoadError from '../components/LoadError.jsx'
import PlanTiles from '../components/home/PlanTiles.jsx'
import usePublicSite from '../hooks/usePublicSite.js'

const GOOD_TO_KNOW = [
  {
    title: 'Parking',
    icon: '🚗',
    text: 'Parking information and arrival details are coming soon.',
    color: 'blue',
  },
  {
    title: 'Accessibility',
    icon: '♿',
    text: 'Accessibility and guest assistance information is coming soon.',
    color: 'purple',
  },
  {
    title: 'Lockers and First Aid',
    icon: '🩹',
    text: 'Locker locations and first aid information are coming soon.',
    color: 'gold',
  },
]

export default function Plan() {
  const { site, error, retry } = usePublicSite()

  return (
    <main className="pub-page pub-page-wide pub-plan-page">

      <div className="pub-plan-heading">
        <span className="pub-plan-eyebrow">
          YOUR ADVENTURE STARTS HERE
        </span>

        <h1 className="pub-h1">Plan Your Visit</h1>

        <p className="pub-lede">
          Everything you need to prepare for an unforgettable
          day at Beltway Park!
        </p>
      </div>

      {error && (
        <LoadError message={error} onRetry={retry} />
      )}

      <PlanTiles
        hours={site?.hours}
        rides={site?.rides}
        bare
      />

      <h2 className="pub-h2 pub-h2-spaced">
        Good to Know
      </h2>

      <p className="pub-lede">
        Helpful information to make your park experience
        easier and more enjoyable.
      </p>

      <div className="pub-plan pub-plan-info">
        {GOOD_TO_KNOW.map((tile) => (
          <article
            key={tile.title}
            className={`pub-info-card pub-info-${tile.color}`}
          >
            <div className="pub-info-icon" aria-hidden="true">
              {tile.icon}
            </div>

            <h3>{tile.title}</h3>

            <p>{tile.text}</p>
          </article>
        ))}
      </div>

      <div className="pub-plan-cta">
        <div>
          <h2>Ready for an Adventure?</h2>
          <p>
            Get your tickets and experience the excitement
            of Beltway Park!
          </p>
        </div>

        <Link to="/tickets" className="pub-buy pub-buy-lg">
          Get Tickets →
        </Link>
      </div>

    </main>
  )
}

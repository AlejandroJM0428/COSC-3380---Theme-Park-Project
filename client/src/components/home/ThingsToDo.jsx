import { Link } from 'react-router-dom'
import BrandImage from '../BrandImage.jsx'
import { BRAND, LANDS } from '../../config/brand.js'

// "Things to do": the three lands plus a Dining & Shops card (built from the Venue table).
export default function ThingsToDo({ venues = [] }) {
  const restaurants = venues.filter((v) => v.venueType === 'Restaurant').length
  const shops = venues.filter((v) => v.venueType === 'Gift Shop').length
  const diningBlurb = [
    restaurants ? `${restaurants} ${restaurants === 1 ? 'restaurant' : 'restaurants'}` : '',
    shops ? `${shops} ${shops === 1 ? 'shop' : 'shops'}` : '',
  ].filter(Boolean).join(' · ') || 'Food, drinks and gifts'

  const cards = [
    ...LANDS.map((land) => ({ key: land.key, title: land.title, blurb: land.blurb, img: land.img })),
    { key: 'dining', title: 'Dining & Shops', blurb: diningBlurb, img: BRAND.images.dining },
  ]

  return (
    <section className="pub-section" aria-labelledby="pub-todo-title">
      <h2 id="pub-todo-title" className="pub-h2">Things to do</h2>
      <div className="pub-cards">
        {cards.map((card) => (
          <Link key={card.key} to={`/rides?land=${card.key}`} className="pub-card">
            <BrandImage src={card.img} className="pub-card-img">
              <span className="pub-card-label">
                <strong>{card.title}</strong>
                <small>{card.blurb}</small>
              </span>
            </BrandImage>
          </Link>
        ))}
      </div>
    </section>
  )
}

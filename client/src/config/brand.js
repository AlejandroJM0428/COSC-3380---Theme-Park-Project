// The ONE place for the park's name, tagline, images and lands.
// Real name, photos and theme come later: change them here and nothing else.
// Images: any path that is missing or fails to load falls back to a neutral gradient
// (see components/BrandImage.jsx), so the layout still holds with no photos.
export const BRAND = {
  name: 'Park Name',
  shortName: 'Park Name',
  tagline: 'Adventure Park',
  // Placeholder homepage copy. Change it here.
  hero: { headline: 'More thrills. Less waiting.', sub: 'Day passes, Express queues and memberships for every kind of adventure.' },
  // Placeholder "Plan your visit" copy. Hours and height rules come from the database.
  plan: { directions: 'Address, parking and transit details will be added here.' },
  images: {
    hero: '/images/roller-coaster.jpg',
    thrill: '/images/thrill-rides.jpg',
    family: '/images/family-rides.jpg',
    kids: '/images/kids-rides.jpg',
    dining: '',
  },
}

// Schematic park map (not to scale). Positions are for the SVG on /rides, keyed by Zone.ZoneName.
// A zone that is not listed here still appears in the list under the map.
export const ZONE_MAP = {
  'Thunder Canyon': { x: 40, y: 40, w: 300, h: 190, fill: '#f0c19c' },
  'Adventure Bay': { x: 560, y: 40, w: 300, h: 190, fill: '#a5d3ec' },
  'Fantasy Forest': { x: 40, y: 270, w: 260, h: 180, fill: '#abd8a9' },
  'Kids Corner': { x: 600, y: 270, w: 260, h: 180, fill: '#f7dc8c' },
  'Main Street': { x: 330, y: 290, w: 240, h: 160, fill: '#d3c4ec' },
}

// The lands guests browse by. `zones` are Zone.ZoneName values from the database.
export const LANDS = [
  { key: 'thrill', title: 'Thrill Rides', blurb: 'Coasters, drops and big speed', img: BRAND.images.thrill, zones: ['Thunder Canyon'] },
  { key: 'family', title: 'Family Favorites', blurb: 'Rides everyone can share', img: BRAND.images.family, zones: ['Main Street', 'Adventure Bay', 'Fantasy Forest'] },
  { key: 'kids', title: 'Kids Corner', blurb: 'Little rides for little riders', img: BRAND.images.kids, zones: ['Kids Corner'] },
]

// The ONE place for the park's name, tagline, images and lands.
// Real name, photos and theme come later: change them here and nothing else.
// Images: any path that is missing or fails to load falls back to a neutral gradient
// (see components/BrandImage.jsx), so the layout still holds with no photos.
export const BRAND = {
  name: 'Beltway Park',   // the same name as Park.ParkName in the database
  shortName: 'Beltway Park',             // compact wordmark in the headers
  established: 2025,                       // shown as "Est. 2025"; no database column for it
  tagline: 'Every Road Leads to Fun!',

  // Park clock. Everything on the site that depends on "now" uses this time zone, not the visitor's.
  timeZone: 'America/Chicago',

  // Happy Hour: shown in the top ticker while the park is open. Times are park time, 24-hour HH:MM.
  // The offer lines are placeholders: change them here and nothing else.
  happyHour: {
    start: '17:30',
    end: '19:00',
    lines: ['Happy Hour is on across the park', 'Ask any team member about today\'s Happy Hour deals'],
  },

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
  'The Loop': { x: 40, y: 40, w: 300, h: 190, fill: '#f0c19c' },
  'Buffalo Bayou': { x: 560, y: 40, w: 300, h: 190, fill: '#a5d3ec' },
  'Montrose': { x: 40, y: 270, w: 260, h: 180, fill: '#abd8a9' },
  'Hermann Park': { x: 600, y: 270, w: 260, h: 180, fill: '#f7dc8c' },
  'Main Street': { x: 330, y: 290, w: 240, h: 160, fill: '#d3c4ec' },
}

// The park's one entertainment venue: a theater. Midway games are separate (they come from the Game table).
// There is no database table for shows, so it lives here. Change the name, text or photo here and nothing else.
// A missing photo falls back to a neutral gradient.
export const ENTERTAINMENT = {
  name: 'Zydeco Stage',
  zoneName: 'Buffalo Bayou',
  kind: 'Theater',
  blurb: 'Live music and stage shows in the heart of the bayou.',
  img: '/images/zydeco-stage.jpg',
}

// The lands guests browse by. `zones` are Zone.ZoneName values from the database.
export const LANDS = [
  { key: 'thrill', title: 'Thrill Rides', blurb: 'Coasters, drops and big speed', img: BRAND.images.thrill, zones: ['The Loop'] },
  { key: 'family', title: 'Family Favorites', blurb: 'Rides everyone can share', img: BRAND.images.family, zones: ['Main Street', 'Buffalo Bayou', 'Montrose'] },
  { key: 'kids', title: 'Kids Rides', blurb: 'Little rides for little riders', img: BRAND.images.kids, zones: ['Hermann Park'] },
]

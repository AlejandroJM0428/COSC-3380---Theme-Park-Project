import RecordManager from '../components/RecordManager.jsx'
import { CUSTOMERS, GAME_PLAYS, MEMBERSHIPS, PURCHASES, RIDE_LOG, WEATHER } from '../config/entitiesMore.js'

// One tiny component per page. Each is registered in PAGE_COMPONENTS in App.jsx
// (key = the `path` in config/nav.js) and switched on with `ready: true` in nav.js.

export const CustomersPage = () => <RecordManager entity={CUSTOMERS} />
export const MembershipsPage = () => <RecordManager entity={MEMBERSHIPS} />
export const PurchasesPage = () => <RecordManager entity={PURCHASES} />
export const GamePlaysPage = () => <RecordManager entity={GAME_PLAYS} />
export const RideLogPage = () => <RecordManager entity={RIDE_LOG} />
export const WeatherPage = () => <RecordManager entity={WEATHER} />

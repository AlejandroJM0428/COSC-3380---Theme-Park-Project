import { useState } from 'react'
import RecordManager from '../components/RecordManager.jsx'
import ParkClosurePanel from '../components/ParkClosurePanel.jsx'
import { CUSTOMERS, FACILITIES, GAME_PLAYS, MEMBERSHIPS, PURCHASES, RIDE_LOG, USERS, WEATHER } from '../config/entitiesMore.js'

// One tiny component per page. Each is registered in PAGE_COMPONENTS in App.jsx
// (key = the `path` in config/nav.js) and switched on with `ready: true` in nav.js.

export const CustomersPage = () => <RecordManager entity={CUSTOMERS} />
export const MembershipsPage = () => <RecordManager entity={MEMBERSHIPS} />
export const PurchasesPage = () => <RecordManager entity={PURCHASES} />
export const GamePlaysPage = () => <RecordManager entity={GAME_PLAYS} />
export const RideLogPage = () => <RecordManager entity={RIDE_LOG} />
// The one-click close/reopen panel sits above the weather form. Only Admin and the Operations desk see it.
// Changing the park's status remounts the list (key) so the new weather entry shows at once.
export function WeatherPage() {
  const [version, setVersion] = useState(0)
  return (
    <>
      <ParkClosurePanel onChanged={() => setVersion((v) => v + 1)} />
      <RecordManager key={version} entity={WEATHER} />
    </>
  )
}
export const FacilitiesPage = () => <RecordManager entity={FACILITIES} />
export const UsersPage = () => <RecordManager entity={USERS} />

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
// The park status banner and the weather log are two views of the same WeatherLog rows. Closing or reopening from the
// banner reloads the list; saving or deleting an entry in the list reloads the banner. Only Admin can close or reopen;
// the other roles that can open this page see the banner and the Severe controls greyed out.
export function WeatherPage() {
  const [listVersion, setListVersion] = useState(0)
  const [panelVersion, setPanelVersion] = useState(0)
  return (
    <>
      <ParkClosurePanel refreshKey={panelVersion} onChanged={() => setListVersion((v) => v + 1)} />
      <RecordManager entity={WEATHER} refreshKey={listVersion} onChanged={() => setPanelVersion((v) => v + 1)} />
    </>
  )
}
export const FacilitiesPage = () => <RecordManager entity={FACILITIES} />
export const UsersPage = () => <RecordManager entity={USERS} />

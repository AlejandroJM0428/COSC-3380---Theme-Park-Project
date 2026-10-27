import RecordManager from '../components/RecordManager.jsx'
import { MAINTENANCE } from '../config/entities.js'

export default function MaintenancePage() {
  return <RecordManager entity={MAINTENANCE} />
}

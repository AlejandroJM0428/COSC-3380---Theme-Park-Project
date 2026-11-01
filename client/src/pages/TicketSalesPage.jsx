import RecordManager from '../components/RecordManager.jsx'
import { TICKETS } from '../config/entities.js'

export default function TicketSalesPage() {
  return <RecordManager entity={TICKETS} />
}

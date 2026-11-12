// Which detail rows of a report can be edited in place, and which record each one opens.
// A detail row is editable only when it carries ONE record's primary key (an ID column). Aggregate and UNION rows have none, so they get no target.
// This file only says WHAT a row is. Who may edit it lives in config/rowEditAccess.js (step 2b), and the server routes still check the role on every write.
import { MAINTENANCE, SHIFTS, TICKETS } from './entities.js'
import { GAME_PLAYS, MEMBERSHIPS, PURCHASES, RIDE_LOG } from './entitiesMore.js'

// idColumn: the column in the detail row that holds the record's ID (same name as the SQL alias in server/reportDetail.js)
// entity:   the config RecordEditor uses (config/entities.js, entitiesMore.js)
// page:     the data-entry page path (FORM_PAGES in config/nav.js), used for "open the full page" links
// skip:     optional (row) => true for a row that has the ID but must not get a button (a refunded ticket: its record is closed)
// notWith:  columns that mean the row belongs to a different record that merely points at this one (a ticket row also has MembershipID)
export const ROW_EDIT_MATCHERS = [
  { idColumn: 'MembershipID', entity: MEMBERSHIPS, page: 'memberships', notWith: ['TicketID', 'PurchaseID', 'GamePlayID', 'CancellationID'] },
  // Purchase and game play rows also carry a TicketID (the ticket they were bought on), so they are matched before tickets.
  { idColumn: 'PurchaseID', entity: PURCHASES, page: 'purchases', notWith: ['GamePlayID', 'CancellationID'] },
  { idColumn: 'GamePlayID', entity: GAME_PLAYS, page: 'game-plays', notWith: ['PurchaseID', 'CancellationID'] },
  { idColumn: 'MaintenanceID', entity: MAINTENANCE, page: 'maintenance' },
  { idColumn: 'ShiftID', entity: SHIFTS, page: 'employees' },
  { idColumn: 'RideLogID', entity: RIDE_LOG, page: 'ride-log' },
  // Refunding a ticket is the Refund (delete) button on its record. A refunded ticket row has no button.
  { idColumn: 'TicketID', entity: TICKETS, page: 'refunds', notWith: ['PurchaseID', 'GamePlayID', 'CancellationID'], skip: (row) => row.Status === 'Refunded' },
]

// editTargetFor(row) -> { entity, id, resource, page } or null (aggregate row, or no matcher for it yet)
export function editTargetFor(row) {
  if (!row || typeof row !== 'object') return null
  for (const m of ROW_EDIT_MATCHERS) {
    const id = row[m.idColumn]
    if (id === null || id === undefined || id === '') continue
    if (m.notWith?.some((col) => row[col] !== null && row[col] !== undefined)) continue
    if (m.skip?.(row)) return null
    return { entity: m.entity, id, resource: m.entity.resource, page: m.page }
  }
  return null
}

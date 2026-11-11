// Which detail rows of a report can be edited in place, and which record each one opens.
// A detail row is editable only when it carries ONE record's primary key (an ID column). Aggregate and UNION rows have none, so they get no target.
// This file only says WHAT a row is. Who may edit it lives in config/rowEditAccess.js (step 2b), and the server routes still check the role on every write.
import { MEMBERSHIPS } from './entitiesMore.js'

// idColumn: the column in the detail row that holds the record's ID (same name as the SQL alias in server/reportDetail.js)
// entity:   the config RecordEditor uses (config/entities.js, entitiesMore.js)
// page:     the data-entry page path (FORM_PAGES in config/nav.js), used for "open the full page" links
// notWith:  columns that mean the row belongs to a different record that merely points at this one (a ticket row also has MembershipID)
export const ROW_EDIT_MATCHERS = [
  { idColumn: 'MembershipID', entity: MEMBERSHIPS, page: 'memberships', notWith: ['TicketID', 'PurchaseID', 'GamePlayID', 'CancellationID'] },
]

// editTargetFor(row) -> { entity, id, resource, page } or null (aggregate row, or no matcher for it yet)
export function editTargetFor(row) {
  if (!row || typeof row !== 'object') return null
  for (const m of ROW_EDIT_MATCHERS) {
    const id = row[m.idColumn]
    if (id === null || id === undefined || id === '') continue
    if (m.notWith?.some((col) => row[col] !== null && row[col] !== undefined)) continue
    return { entity: m.entity, id, resource: m.entity.resource, page: m.page }
  }
  return null
}

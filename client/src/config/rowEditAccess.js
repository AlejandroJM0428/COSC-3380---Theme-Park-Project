// Who may edit or delete ONE row from a report, using the same rules RecordManager applies on its own page.
// This only decides whether the button is shown or greyed out. The server routes check the role again on every write.
import { EDIT_ROLES } from './reportEdits.js'

const NO_ROLE = 'Insufficient privileges'

// canEditRow(entity, row, user) -> { allowed, reason }
// Checks, in order: EDIT_ROLES (reports.js link list), entity.writeRoles, entity.editRoles, entity.canEditRow(row), entity.rowLock(row, user).
export function canEditRow(entity, row, user) {
  const role = user?.role
  if (!EDIT_ROLES.includes(role)) return { allowed: false, reason: NO_ROLE }
  if (entity.writeRoles && !entity.writeRoles.includes(role)) return { allowed: false, reason: NO_ROLE }
  if (entity.editRoles && !entity.editRoles.includes(role)) return { allowed: false, reason: NO_ROLE }
  if (entity.canEditRow && !entity.canEditRow(row)) return { allowed: false, reason: 'This record can no longer be edited.' }
  const lock = entity.rowLock?.(row, user)
  if (lock) return { allowed: false, reason: lock }
  return { allowed: true, reason: '' }
}

// canDeleteRow(entity, row, user) -> { allowed, reason }
// Checks, in order: EDIT_ROLES, entity.writeRoles, entity.deleteRoles, entity.canDeleteRow(row), entity.rowLock(row, user).
export function canDeleteRow(entity, row, user) {
  const role = user?.role
  if (!EDIT_ROLES.includes(role)) return { allowed: false, reason: NO_ROLE }
  if (entity.writeRoles && !entity.writeRoles.includes(role)) return { allowed: false, reason: NO_ROLE }
  if (!entity.deleteRoles?.includes(role)) return { allowed: false, reason: NO_ROLE }
  if (entity.canDeleteRow && !entity.canDeleteRow(row)) return { allowed: false, reason: 'This record can no longer be deleted.' }
  const lock = entity.rowLock?.(row, user)
  if (lock) return { allowed: false, reason: lock }
  return { allowed: true, reason: '' }
}

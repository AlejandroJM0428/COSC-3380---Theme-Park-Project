import { http } from './http.js'

// Live trigger list from the database, matched to plain-English descriptions. Admin and Manager only.
export function listTriggers() {
  return http('/triggers')
}

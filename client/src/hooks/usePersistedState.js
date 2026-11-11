import { useCallback, useState } from 'react'
import { useAuth } from '../auth/context.js'

// useState that survives a refresh. Used for the messages a database trigger produces (a rule that blocked
// something, or a confirmation of what the park added), so they stay on screen until the person closes them
// instead of vanishing when the page reloads.
//
// It is kept in sessionStorage: it lives as long as the browser tab and is never shared with another tab or person.
// The key also holds the signed-in username, so a different person in the same tab never sees it, and
// clearPersisted() (called on log out) wipes all of them.
// An empty value ('' or null) removes the entry. If storage is blocked it behaves like plain useState.
const PREFIX = 'park.sticky.'

export function clearPersisted() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => sessionStorage.removeItem(k))
  } catch { /* storage blocked: nothing to clear */ }
}

export default function usePersistedState(name, initial = null) {
  const auth = useAuth()
  const key = `${PREFIX}${auth?.user?.username ?? 'guest'}.${name}`

  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw == null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })

  const set = useCallback((next) => {
    setValue(next)
    try {
      if (next === '' || next == null) sessionStorage.removeItem(key)
      else sessionStorage.setItem(key, JSON.stringify(next))
    } catch { /* private mode: fine */ }
  }, [key])

  return [value, set]
}

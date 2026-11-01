import { useEffect, useState } from 'react'
import * as api from '../api/index.js'
import { USE_MOCK } from '../api/index.js'
import { SESSION_EXPIRED } from '../api/http.js'
import { AuthContext } from './context.js'

const STORAGE_KEY = 'themepark.user'

// NOTE: this only remembers WHO is logged in so the menu can adapt. It is not security:
// real password checking must happen on a server (ask the professor how login should work).
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY))
    } catch {
      return null
    }
  })

  // The tab only remembers who signed in while it stays open. A new tab or window starts empty even
  // though the session cookie is still valid, so ask the server once. `ready` is false until we know,
  // so pages do not flash "sign in / create an account" at someone who is already signed in.
  const [ready, setReady] = useState(() => user != null || USE_MOCK)
  useEffect(() => {
    if (ready) return undefined
    let alive = true
    api.getSessionUser()
      .then((found) => {
        if (!alive || !found?.username) return
        const who = { username: found.username, role: found.role }
        setUser(who)
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(who)) } catch { /* storage blocked */ }
      })
      .catch(() => {}) // not signed in (401) or server down: stay signed out
      .finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [ready])

  // The server no longer knows this session (it restarted, or the session ran out): forget the user.
  // The route guards then send them to the sign in page, and back to this page after they sign in.
  useEffect(() => {
    function expired() {
      setUser(null)
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // storage blocked; the state above is enough
      }
    }
    window.addEventListener(SESSION_EXPIRED, expired)
    return () => window.removeEventListener(SESSION_EXPIRED, expired)
  }, [])

  async function login(username, password, audience) {
    const loggedIn = await api.login(username, password, audience) // { username, role }
    setUser(loggedIn)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(loggedIn))
    return loggedIn
  }

  async function register(data) {
    const created = await api.register(data) // { username, role: 'Customer' }
    setUser(created)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(created))
    return created
  }

  function logout() {
    setUser(null)
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return <AuthContext.Provider value={{ user, ready, login, register, logout }}>{children}</AuthContext.Provider>
}

import { useEffect, useState } from 'react'
import * as api from '../api/index.js'
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

  // True after the person pressed Log out. The route guards then send them to the home page instead of the sign-in page.
  // It is turned off again by the next sign-in or sign-up.
  const [signedOut, setSignedOut] = useState(false)

  // The tab only remembers who signed in while it stays open. A new tab or window starts empty even
  // though the session cookie is still valid, so ask the server once. `ready` is false until we know,
  // so pages do not flash "sign in / create an account" at someone who is already signed in.
  const [ready, setReady] = useState(() => user != null)
  useEffect(() => {
    if (ready) return undefined
    let alive = true
    api.getSessionUser()
      .then((found) => {
        if (!alive || !found?.username) return
        const who = { username: found.username, role: found.role, name: found.name ?? null }
        setUser(who)
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(who)) } catch { /* storage blocked */ }
      })
      .catch(() => {}) // not signed in (401) or server down: stay signed out
      .finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [ready])

  // A tab that was signed in before names were sent has no name stored. Ask the server once so the top bar shows the person's name.
  const needsName = user != null && !user.name
  useEffect(() => {
    if (!needsName) return undefined
    let alive = true
    api.getSessionUser()
      .then((found) => {
        if (!alive || !found?.name) return
        setUser((prev) => {
          if (!prev) return prev
          const who = { ...prev, name: found.name }
          try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(who)) } catch { /* storage blocked */ }
          return who
        })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [needsName])

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

  async function login(username, password) {
    const loggedIn = await api.login(username, password) // { username, role, name }
    setSignedOut(false)
    setUser(loggedIn)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(loggedIn))
    return loggedIn
  }

  async function register(data) {
    const created = await api.register(data) // { username, role: 'Customer' }
    setSignedOut(false)
    setUser(created)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(created))
    return created
  }

  // Log out: forget the person here AND end the server session (before, only this tab forgot, so a new tab or a refresh
  // signed them straight back in). The guards send a signed-out person to the home page.
  function logout() {
    setSignedOut(true)
    setUser(null)
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage blocked; the state above is enough
    }
    api.logoutRequest().catch(() => {}) // the page is already signed out even if the server cannot be reached
  }

  return <AuthContext.Provider value={{ user, ready, signedOut, login, register, logout }}>{children}</AuthContext.Provider>
}

import { useState } from 'react'
import * as api from '../api/index.js'
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

  async function login(username, password) {
    const loggedIn = await api.login(username, password) // { username, role }
    setUser(loggedIn)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(loggedIn))
    return loggedIn
  }

  function logout() {
    setUser(null)
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

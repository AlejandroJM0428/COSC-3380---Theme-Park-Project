import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

// const { user, login, logout } = useAuth()   ->   user = { username, role } or null
export function useAuth() {
  return useContext(AuthContext)
}

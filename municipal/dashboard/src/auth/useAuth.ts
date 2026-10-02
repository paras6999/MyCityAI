import { createContext, useContext } from 'react'

import type { User } from '../api/types'

export interface AuthState {
  user: User | null
  /** True until we know whether a saved session is still valid. */
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

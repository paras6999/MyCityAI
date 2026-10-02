import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { getMe, staffLogin } from '../api/auth'
import type { User } from '../api/types'
import { SESSION_EXPIRED_EVENT, tokenStorage } from './tokenStorage'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => tokenStorage.getAccess() !== null)

  const logout = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  // Restore a saved session on page load.
  useEffect(() => {
    if (!tokenStorage.getAccess()) return
    getMe()
      .then(setUser)
      .catch(() => tokenStorage.clear())
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout)
  }, [logout])

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await staffLogin(username, password)
    tokenStorage.save(tokens.access_token, tokens.refresh_token)
    setUser(tokens.user)
    return tokens.user
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

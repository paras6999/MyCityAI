import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import { ApiError, tokens } from '../api/client'
import type { Language, OtpTokenResponse, User } from '../api/types'
import { useI18n } from '../i18n'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

interface AuthValue {
  status: AuthStatus
  user: User | null
  /** Set when the stored session could not be checked (e.g. offline at launch). */
  bootError: ApiError | null
  retryBoot: () => void
  /** Name typed on the Create account screen; saved right after the first successful OTP check. */
  setPendingName: (name: string) => void
  verifyOtp: (phone: string, otp: string) => Promise<OtpTokenResponse>
  updateProfile: (changes: { name?: string; language?: Language; ward_id?: number | null }) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children, onSessionExpired }: { children: ReactNode; onSessionExpired?: () => void }) {
  const { setLanguage } = useI18n()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [bootError, setBootError] = useState<ApiError | null>(null)
  const pendingName = useRef<string | null>(null)

  const boot = useCallback(async () => {
    setBootError(null)
    setStatus('loading')
    if (!(await tokens.load())) return setStatus('signedOut')
    try {
      const me = await authApi.me()
      setUser(me)
      setLanguage(me.language)
      setStatus('signedIn')
    } catch (error) {
      if (error instanceof ApiError && !error.isNetwork) {
        await tokens.clear()
        setStatus('signedOut')
      } else {
        setBootError(error as ApiError)
      }
    }
  }, [setLanguage])

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    tokens.setSessionExpiredHandler(() => {
      setUser(null)
      setStatus('signedOut')
      onSessionExpired?.()
    })
    return () => tokens.setSessionExpiredHandler(null)
  }, [onSessionExpired])

  const verifyOtp = useCallback(
    async (phone: string, otp: string) => {
      const result = await authApi.verifyOtp(phone, otp)
      await tokens.save(result.access_token, result.refresh_token)
      let current = result.user
      const name = pendingName.current?.trim()
      pendingName.current = null
      if (name && !current.name) current = await authApi.updateMe({ name })
      setUser(current)
      setLanguage(current.language)
      setStatus('signedIn')
      return { ...result, user: current }
    },
    [setLanguage],
  )

  const updateProfile = useCallback<AuthValue['updateProfile']>(async (changes) => {
    const updated = await authApi.updateMe(changes)
    setUser(updated)
    return updated
  }, [])

  const logout = useCallback(async () => {
    await tokens.clear()
    setUser(null)
    setStatus('signedOut')
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status, user, bootError, retryBoot: () => void boot(),
      setPendingName: (name) => { pendingName.current = name },
      verifyOtp, updateProfile, logout,
    }),
    [status, user, bootError, boot, verifyOtp, updateProfile, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

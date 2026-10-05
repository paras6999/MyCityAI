import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { ApiError } from '../api/client'
import { notificationsApi, type AppNotification } from '../api/notifications'
import { registerForPush } from '../lib/push'

interface NotificationsValue {
  items: AppNotification[]
  readIds: Set<string>
  unreadCount: number
  loading: boolean
  error: ApiError | null
  reload: () => Promise<void>
  markRead: (id: string) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsValue | null>(null)

/** Shared by the tab badge, the Home bell and the Notifications screen. Mounted only while signed in. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, read] = await Promise.all([notificationsApi.list(), notificationsApi.readIds()])
      setItems(list)
      setReadIds(read)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Unexpected error'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    void registerForPush(false) // registers silently when permission was already granted
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && void reload())
    return () => subscription.remove()
  }, [reload])

  const persist = (next: Set<string>) => {
    setReadIds(next)
    void notificationsApi.saveReadIds(next)
  }

  const value = useMemo<NotificationsValue>(
    () => ({
      items, readIds, loading, error, reload,
      unreadCount: items.filter((n) => !readIds.has(n.id)).length,
      markRead: (id) => persist(new Set(readIds).add(id)),
      markAllRead: () => persist(new Set([...readIds, ...items.map((n) => n.id)])),
    }),
    [items, readIds, loading, error, reload],
  )
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext)
  if (!value) throw new Error('useNotifications must be used inside NotificationsProvider')
  return value
}

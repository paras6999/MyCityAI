import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getMe } from '../api/auth'
import { API_URL } from '../api/client'
import type { AiSuggestion, Complaint, StaffRole } from '../api/types'
import { tokenStorage } from '../auth/tokenStorage'
import { useToast } from '../components/toast/toastContext'

export type SocketStatus = 'connecting' | 'live' | 'reconnecting'

// ws://host:8000/ws/dashboard, derived from the REST URL unless set explicitly.
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  API_URL.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '/ws/dashboard')

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000]
// Close codes from the backend (API.md §10.1)
const CLOSE_UNAUTHORIZED = 4401
const CLOSE_FORBIDDEN = 4403

const DETAIL_BASE: Partial<Record<StaffRole, string>> = {
  officer: '/officer/complaints',
  ward_rep: '/ward/complaints',
  mayor: '/mayor/complaints',
}

// Escalation level that lands in each role's inbox (API.md §2.6).
const INBOX_LEVEL: Partial<Record<StaffRole, number>> = { ward_rep: 1, mayor: 2 }

interface DashboardEvent {
  event: string
  data: Complaint
  at: string
}

/** Keeps a WebSocket open to the backend and refreshes cached data when events arrive. */
export function useDashboardSocket(role: StaffRole): SocketStatus {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<SocketStatus>('connecting')
  // Latest callbacks without re-opening the socket when they change.
  const handlers = useRef({ t, toast, queryClient })
  useEffect(() => {
    handlers.current = { t, toast, queryClient }
  })

  useEffect(() => {
    let socket: WebSocket | null = null
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    function handleEvent(message: DashboardEvent) {
      const { t, toast, queryClient } = handlers.current
      if (message.event === 'suggestion.created') {
        const suggestion = message.data as unknown as AiSuggestion
        queryClient.invalidateQueries({ queryKey: ['suggestions'] })
        queryClient.invalidateQueries({ queryKey: ['sensors'] })
        toast.show({ title: t('live.suggestion', { title: suggestion.title }), body: suggestion.body })
        return
      }
      if (message.event.startsWith('announcement.')) return
      const complaint = message.data
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      queryClient.invalidateQueries({ queryKey: ['complaint', complaint.id] })
      queryClient.invalidateQueries({ queryKey: ['timeline', complaint.id] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })

      const base = DETAIL_BASE[role]
      const href = base ? `${base}/${complaint.id}` : undefined
      const category = t(`category.${complaint.category}`)
      if (message.event === 'complaint.escalated' && complaint.escalation_level === INBOX_LEVEL[role]) {
        toast.show({ title: t('live.escalated', { category }), body: complaint.code, href })
      } else if (message.event === 'complaint.escalated' && role === 'officer') {
        toast.show({ title: t('live.escalatedAway', { category }), body: complaint.code, href })
      } else if (message.event === 'complaint.reminder' && role === 'officer') {
        toast.show({ title: t('live.reminder', { category }), body: complaint.code, href })
      }

      if (message.event === 'complaint.created') {
        toast.show({
          title: t('live.newComplaint', { category }),
          body: complaint.description ?? complaint.code,
          href,
        })
      }
    }

    function scheduleReconnect() {
      if (stopped) return
      setStatus('reconnecting')
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
      attempt += 1
      retryTimer = setTimeout(connect, delay)
    }

    function connect() {
      const token = tokenStorage.getAccess()
      if (!token || stopped) return
      socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
      socket.onopen = () => {
        attempt = 0
        setStatus('live')
        // Catch up on anything that happened while disconnected.
        handlers.current.queryClient.invalidateQueries({ queryKey: ['complaints'] })
      }
      socket.onmessage = (event) => {
        try {
          handleEvent(JSON.parse(event.data) as DashboardEvent)
        } catch {
          // Ignore malformed messages.
        }
      }
      socket.onclose = (event) => {
        socket = null
        if (stopped || event.code === CLOSE_FORBIDDEN) return
        if (event.code === CLOSE_UNAUTHORIZED) {
          // Any API call refreshes an expired access token (see api/client.ts), then retry.
          getMe().then(connect, scheduleReconnect)
          return
        }
        scheduleReconnect()
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      socket?.close()
    }
  }, [role])

  return status
}

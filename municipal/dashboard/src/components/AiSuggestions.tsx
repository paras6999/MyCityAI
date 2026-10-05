import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, ClipboardPlus, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import type { AiSuggestion } from '../api/types'
import { createWorkOrder, dismissSuggestion, listSuggestions } from '../api/utilities'
import { useAuth } from '../auth/useAuth'
import { formatDateTime } from '../lib/format'
import { useToast } from './toast/toastContext'

const BASE: Record<string, string> = { officer: '/officer', ward_rep: '/ward', mayor: '/mayor' }

/**
 * AI suggestions panel (API.md §6.9): what the agents noticed, e.g. a possible leak.
 * Renders nothing when there are no open suggestions.
 */
export function AiSuggestions() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['suggestions'], queryFn: listSuggestions })
  const base = (user && BASE[user.role]) ?? '/officer'
  const canAct = user?.role === 'officer' || user?.role === 'mayor' || user?.role === 'admin'

  function onError(error: unknown) {
    toast.show({ title: t('suggestions.failed'), body: error instanceof ApiError ? error.message : undefined })
  }

  const dismiss = useMutation({
    mutationFn: dismissSuggestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] })
      queryClient.invalidateQueries({ queryKey: ['sensors'] })
    },
    onError,
  })
  const workOrder = useMutation({
    mutationFn: createWorkOrder,
    onSuccess: (complaint) => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] })
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      toast.show({ title: t('suggestions.workOrderCreated'), body: complaint.code })
      navigate(`${base}/complaints/${complaint.id}`)
    },
    onError,
  })

  if (!data?.length) return null
  const busy = dismiss.isPending || workOrder.isPending

  return (
    <section className="rounded-xl border border-accent-border bg-accent-light/50 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
        <Sparkles size={16} aria-hidden />
        {t('suggestions.title', { count: data.length })}
      </h2>
      <ul className="mt-3 space-y-2">
        {data.map((s: AiSuggestion) => (
          <li key={s.id} className="rounded-lg bg-surface p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{s.title}</div>
                <p className="mt-0.5 text-sm text-muted">{s.body}</p>
                <div className="mt-1 text-xs text-faint">
                  {t('suggestions.updated', { time: formatDateTime(s.updated_at) })}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => dismiss.mutate(s.id)}
                className="shrink-0 rounded-md p-1 text-faint hover:bg-neutral-bg hover:text-text"
                aria-label={t('suggestions.dismiss')}
                title={t('suggestions.dismiss')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.ref.sensor_id && (
                <Link
                  to={`${base}/utilities?sensor=${s.ref.sensor_id}`}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-bg px-3 py-1.5 text-xs font-semibold hover:bg-border"
                >
                  <Activity size={14} aria-hidden />
                  {t('suggestions.viewSensor')}
                </Link>
              )}
              {canAct && s.type === 'anomaly' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => workOrder.mutate(s.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <ClipboardPlus size={14} aria-hidden />
                  {t('suggestions.workOrder')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

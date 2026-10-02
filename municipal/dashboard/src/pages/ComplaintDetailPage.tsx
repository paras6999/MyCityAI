import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ImageOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router-dom'

import { getComplaint, getDuplicates, getTimeline, mediaUrl } from '../api/complaints'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { AiAnalysisCard } from '../components/AiAnalysisCard'
import { BeforeAfterCard } from '../components/BeforeAfterCard'
import { ComplaintActions } from '../components/ComplaintActions'
import { ComplaintMap } from '../components/ComplaintMap'
import { DetectionPhoto } from '../components/DetectionPhoto'
import { PriorityBadge } from '../components/PriorityBadge'
import { SlaLabel } from '../components/SlaLabel'
import { StatusChip } from '../components/StatusChip'
import { Timeline } from '../components/Timeline'
import { useWards } from '../hooks/useWards'
import { formatDateTime } from '../lib/format'

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-sm">
      {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

export function ComplaintDetailPage({ backTo }: { backTo: string }) {
  const { t } = useTranslation()
  const { id } = useParams()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const complaintId = Number(id)
  const { user } = useAuth()
  const { byId: wards } = useWards()

  const complaint = useQuery({
    queryKey: ['complaint', complaintId],
    queryFn: () => getComplaint(complaintId),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  const timeline = useQuery({
    queryKey: ['timeline', complaintId],
    queryFn: () => getTimeline(complaintId),
    enabled: complaint.isSuccess,
  })
  const duplicates = useQuery({
    // Under ['complaint', id] so live updates (useDashboardSocket) refresh it too.
    queryKey: ['complaint', complaintId, 'duplicates'],
    queryFn: () => getDuplicates(complaintId),
    enabled: complaint.isSuccess && complaint.data.duplicate_count > 0,
  })

  const back = (
    <Link to={from ?? backTo} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ArrowLeft size={16} aria-hidden />
      {t('detail.back')}
    </Link>
  )

  if (complaint.isPending) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (complaint.isError) {
    const notFound = complaint.error instanceof ApiError && complaint.error.status === 404
    return (
      <div className="space-y-4">
        {back}
        <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">
          {notFound ? t('detail.notFound') : t('detail.loadError')}
        </p>
      </div>
    )
  }

  const c = complaint.data
  const ward = c.location.ward_id ? wards.get(c.location.ward_id) : undefined
  const photo = mediaUrl(c.photo_url)
  const canEdit = user?.role === 'officer' || user?.role === 'mayor' || user?.role === 'admin'
  const detailBase = location.pathname.replace(/\/\d+$/, '')

  return (
    <div className="space-y-4">
      {back}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t(`category.${c.category}`)}</h1>
        <StatusChip status={c.status} />
        <PriorityBadge score={c.priority_score} level={c.priority_level} />
        <span className="font-mono text-xs text-muted">{c.code}</span>
      </div>

      {c.merged_into_id && (
        <p className="rounded-lg bg-neutral-bg px-4 py-2.5 text-sm text-neutral">
          {t('detail.mergedInto')}{' '}
          <Link to={`${detailBase}/${c.merged_into_id}`} className="font-semibold text-primary underline">
            #{c.merged_into_id}
          </Link>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            {photo ? (
              <DetectionPhoto
                src={photo}
                alt={t('detail.photoAlt', { category: t(`category.${c.category}`) })}
                detections={c.ai?.detections ?? []}
              />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg bg-neutral-bg text-sm text-muted">
                <ImageOff size={24} aria-hidden />
                {t('detail.noPhoto')}
              </div>
            )}
            {c.description && <p className="mt-3 text-sm leading-relaxed">{c.description}</p>}
          </Card>

          <BeforeAfterCard complaint={c} />

          <Card title={t('detail.details')}>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label={t('detail.department')}>{t(`departments.${c.department}`)}</Field>
              <Field label={t('detail.ward')}>{ward ? `${ward.number} · ${ward.name}` : '—'}</Field>
              <Field label={t('detail.reports')}>{c.duplicate_count + 1}</Field>
              <Field label={t('detail.reported')}>{formatDateTime(c.created_at)}</Field>
              <Field label={t('detail.sla')}>
                <SlaLabel dueAt={c.sla_due_at} status={c.status} />
              </Field>
              <Field label={t('detail.assignedTo')}>{c.assigned_to?.name ?? '—'}</Field>
              <Field label={t('detail.reporter')}>
                {c.reporter ? `${c.reporter.name ?? t('roles.citizen')} · ${c.reporter.phone_masked ?? ''}` : '—'}
              </Field>
              <Field label={t('detail.source')}>{t(`source.${c.source}`)}</Field>
            </dl>
          </Card>

          {c.duplicate_count > 0 && (
            <Card title={`${t('detail.duplicates')} (${c.duplicate_count})`}>
              <ul className="divide-y divide-neutral-bg">
                {duplicates.data?.map((d) => (
                  <li key={d.id} className="py-2 first:pt-0 last:pb-0">
                    <Link to={`${detailBase}/${d.id}`} className="flex items-baseline justify-between gap-3 text-sm hover:text-primary">
                      <span className="min-w-0 truncate">{d.description ?? t(`category.${d.category}`)}</span>
                      <span className="shrink-0 font-mono text-xs text-muted">{d.code}</span>
                    </Link>
                    <div className="text-xs text-muted">{formatDateTime(d.created_at)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={t('detail.location')}>
            <ComplaintMap lat={c.location.lat} lng={c.location.lng} />
            <p className="mt-2 text-xs text-muted">
              {c.location.address ? `${c.location.address} · ` : ''}
              {c.location.lat.toFixed(5)}, {c.location.lng.toFixed(5)}
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {c.ai && <AiAnalysisCard ai={c.ai} />}
          <Card title={t('detail.actions')}>
            <ComplaintActions key={c.updated_at} complaint={c} canEdit={canEdit} />
          </Card>
          <Card title={t('detail.timeline')}>
            {timeline.data ? (
              <Timeline events={timeline.data} />
            ) : (
              <p className="text-sm text-muted">{t('common.loading')}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

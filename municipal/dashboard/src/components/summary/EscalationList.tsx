import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { listComplaints } from '../../api/complaints'
import { useWards } from '../../hooks/useWards'
import { EscalationBadge } from '../EscalationBadge'
import { SlaLabel } from '../SlaLabel'

/** The few most urgent escalated complaints (deadline first), linking to their detail page. */
export function EscalationList({ detailBase, level }: { detailBase: string; level?: number }) {
  const { t } = useTranslation()
  const { byId: wards } = useWards()
  const filters = { escalated: true, escalation_level: level, sort: 'sla_due_at', page_size: 5 } as const
  const { data, isPending } = useQuery({
    queryKey: ['complaints', filters],
    queryFn: () => listComplaints(filters),
  })

  if (isPending) return <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
  if (!data?.items.length) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-success">
        <CheckCircle2 size={16} aria-hidden />
        {t('overview.noEscalations')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-bg">
      {data.items.map((c) => {
        const ward = c.location.ward_id ? wards.get(c.location.ward_id) : undefined
        return (
          <li key={c.id}>
            <Link
              to={`${detailBase}/${c.id}`}
              className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{t(`category.${c.category}`)}</span>
                  <EscalationBadge level={c.escalation_level} />
                </span>
                <span className="block truncate text-xs text-muted">
                  {t(`departments.${c.department}`)}
                  {ward && ` · ${t('overview.wardLabel', { number: ward.number, name: ward.name })}`}
                  {` · ${c.code}`}
                </span>
              </span>
              <span className="shrink-0 text-xs">
                <SlaLabel dueAt={c.sla_due_at} status={c.status} />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

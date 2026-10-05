import {
  AlarmClock,
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  Inbox,
  Percent,
  Star,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { SummaryKpis } from '../../api/types'
import { formatHours, formatPercent } from '../../lib/format'

const ICON_TONE = {
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  accent: 'bg-accent-light text-accent',
  neutral: 'bg-neutral-bg text-neutral',
}

interface Card {
  key: string
  value: string | number
  icon: LucideIcon
  tone: keyof typeof ICON_TONE
  href?: string
}

/** KPI cards for the signed-in role (API.md §6.8). With `queuePath`, counts link to the queue. */
export function KpiCards({
  kpis,
  queuePath,
  escalationsPath,
}: {
  kpis: SummaryKpis
  queuePath?: string
  escalationsPath?: string
}) {
  const { t } = useTranslation()
  const cards: Card[] = [
    { key: 'open', value: kpis.open, icon: Inbox, tone: 'info', href: queuePath },
    {
      key: 'overdue',
      value: kpis.overdue,
      icon: AlertTriangle,
      tone: kpis.overdue ? 'danger' : 'neutral',
      href: queuePath && `${queuePath}?sla=overdue`,
    },
    {
      key: 'dueSoon',
      value: kpis.due_soon,
      icon: AlarmClock,
      tone: kpis.due_soon ? 'warning' : 'neutral',
      href: queuePath && `${queuePath}?sla=due_soon`,
    },
  ]
  if (kpis.escalated_to_me !== null) {
    cards.push({
      key: 'escalatedToMe',
      value: kpis.escalated_to_me,
      icon: ArrowUpCircle,
      tone: kpis.escalated_to_me ? 'accent' : 'neutral',
      href: escalationsPath,
    })
  }
  cards.push(
    { key: 'resolvedWeek', value: kpis.resolved_this_week, icon: CheckCircle2, tone: 'success' },
    { key: 'resolutionRate', value: formatPercent(kpis.resolution_rate), icon: Percent, tone: 'success' },
    { key: 'avgTime', value: formatHours(kpis.avg_resolution_hours), icon: Timer, tone: 'info' },
    {
      key: 'satisfaction',
      value: kpis.satisfaction_avg === null ? '—' : `${kpis.satisfaction_avg} / 5`,
      icon: Star,
      tone: 'warning',
    },
    { key: 'duplicates', value: kpis.duplicates_merged, icon: Copy, tone: 'neutral' },
  )

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map(({ key, value, icon: Icon, tone, href }) => {
        const body = (
          <>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_TONE[tone]}`}>
              <Icon size={18} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight">{value}</span>
              <span className="block truncate text-xs text-muted">{t(`kpi.${key}`)}</span>
            </span>
          </>
        )
        const className = 'flex min-w-0 items-center gap-3 rounded-xl bg-surface p-3.5 shadow-sm'
        return href ? (
          <Link key={key} to={href} className={`${className} hover:ring-2 hover:ring-primary-light`}>
            {body}
          </Link>
        ) : (
          <div key={key} className={className}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

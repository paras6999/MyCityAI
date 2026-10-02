import { useTranslation } from 'react-i18next'

import type { Status } from '../api/types'
import { formatDuration, hoursUntil } from '../lib/format'

const STOPPED: Status[] = ['resolved', 'closed', 'rejected', 'merged']
const DUE_SOON_HOURS = 12

/** "3 h left" (amber when < 12 h) or "overdue 5 h" (red). Empty once the SLA no longer applies. */
export function SlaLabel({ dueAt, status }: { dueAt: string; status: Status }) {
  const { t } = useTranslation()
  if (STOPPED.includes(status)) return <span className="text-faint">—</span>

  const hours = hoursUntil(dueAt)
  const duration = formatDuration(hours)
  if (hours < 0) {
    return <span className="font-semibold text-danger">{t('sla.overdue', { duration })}</span>
  }
  const tone = hours < DUE_SOON_HOURS ? 'font-semibold text-warning' : 'text-muted'
  return <span className={tone}>{t('sla.left', { duration })}</span>
}

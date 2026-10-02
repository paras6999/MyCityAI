import { useTranslation } from 'react-i18next'

import type { Status } from '../api/types'

// Colours from docs/Design.md §2.3
const TONE: Record<Status, string> = {
  new: 'bg-neutral-bg text-neutral',
  merged: 'bg-neutral-bg text-neutral',
  assigned: 'bg-warning-bg text-warning',
  in_progress: 'bg-info-bg text-info',
  resolved: 'bg-accent-light text-accent',
  closed: 'bg-success-bg text-success',
  reopened: 'bg-danger-bg text-danger',
  rejected: 'bg-neutral-bg text-neutral',
}

export function StatusChip({ status }: { status: Status }) {
  const { t } = useTranslation()
  const tone = TONE[status] ?? 'bg-neutral-bg text-neutral'
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  )
}

import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PriorityLevel } from '../api/types'

// Colours from docs/Design.md §2.4
const TONE: Record<PriorityLevel, string> = {
  low: 'bg-success-bg text-success',
  medium: 'bg-warning-bg text-warning',
  high: 'bg-danger-bg text-danger',
  critical: 'bg-critical-bg text-critical',
}

export function PriorityBadge({ score, level }: { score: number; level: PriorityLevel }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[level]}`}
      title={t(`priority.${level}`)}
    >
      {level === 'critical' && <AlertTriangle size={12} aria-hidden />}
      {score}
      <span className="sr-only">{t(`priority.${level}`)}</span>
    </span>
  )
}

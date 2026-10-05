import { MapPin, MapPinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PhotoCheck } from '../api/types'

/** Was the photo taken with the camera on the spot, just now? (API.md §5.6) */
export function PhotoCheckBadge({ check }: { check: PhotoCheck | null }) {
  const { t } = useTranslation()
  if (!check) return null

  if (check.live) {
    const distance =
      check.distance_m !== null
        ? t('photoCheck.distance', { meters: Math.round(check.distance_m) })
        : t('photoCheck.atReported')
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-success">
        <MapPin size={14} aria-hidden />
        {t('photoCheck.live')}
        <span className="font-normal text-muted">
          · {t('photoCheck.liveDetail', { source: t(`photoCheck.source.${check.source}`), distance })}
        </span>
      </p>
    )
  }

  return (
    <div className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
      <p className="flex items-center gap-1.5 font-semibold">
        <MapPinOff size={14} aria-hidden />
        {t('photoCheck.notLive')}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {check.problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  )
}

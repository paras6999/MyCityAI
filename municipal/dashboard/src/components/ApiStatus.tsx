import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getHealth } from '../api/health'

/** Small pill showing whether the municipal backend is reachable. */
export function ApiStatus() {
  const { t } = useTranslation()
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 15000,
    retry: false,
  })

  let label = t('apiStatus.online')
  let dot = 'bg-success'
  if (isPending) {
    label = t('apiStatus.checking')
    dot = 'bg-faint'
  } else if (isError) {
    label = t('apiStatus.offline')
    dot = 'bg-danger'
  } else if (data.database !== 'ok') {
    label = t('apiStatus.dbDown')
    dot = 'bg-warning'
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}

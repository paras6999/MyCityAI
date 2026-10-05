import { useTranslation } from 'react-i18next'

import type { CategoryCount } from '../../api/types'

/** Horizontal bars: complaints per category (top 8). */
export function CategoryBars({ items }: { items: CategoryCount[] }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{t('overview.noData')}</p>
  }
  const top = items.slice(0, 8)
  const max = Math.max(...top.map((c) => c.count))

  return (
    <ul className="space-y-2.5">
      {top.map((c) => (
        <li key={c.category}>
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate font-medium">{t(`category.${c.category}`)}</span>
            <span className="text-muted">{c.count}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

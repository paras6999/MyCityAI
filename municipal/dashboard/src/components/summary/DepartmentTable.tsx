import { useTranslation } from 'react-i18next'

import type { DepartmentSummary } from '../../api/types'
import { formatHours, formatPercent, rateTone, TONE_TEXT } from '../../lib/format'
import { RateBar } from './Section'

/** Departments, best resolution rate first (the API sorts them). `ranked` adds a # column. */
export function DepartmentTable({ items, ranked = false }: { items: DepartmentSummary[]; ranked?: boolean }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{t('overview.noData')}</p>
  }

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-semibold text-muted">
            {ranked && <th className="py-2 pr-3">#</th>}
            <th className="py-2 pr-3">{t('overview.col.department')}</th>
            <th className="py-2 pr-3">{t('overview.col.open')}</th>
            <th className="py-2 pr-3">{t('overview.col.overdue')}</th>
            <th className="py-2 pr-3">{t('overview.col.resolved')}</th>
            <th className="w-44 py-2 pr-3">{t('overview.col.rate')}</th>
            <th className="py-2 pr-3">{t('overview.col.avgTime')}</th>
            <th className="py-2">{t('overview.col.breaches')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d, index) => {
            const tone = rateTone(d.resolution_rate, d.total)
            return (
              <tr key={d.department} className="border-b border-neutral-bg last:border-0">
                {ranked && <td className="py-2.5 pr-3 font-bold text-muted">{index + 1}</td>}
                <td className="py-2.5 pr-3 font-medium">{t(`departments.${d.department}`)}</td>
                <td className="py-2.5 pr-3">{d.open}</td>
                <td className={`py-2.5 pr-3 ${d.overdue ? 'font-semibold text-danger' : ''}`}>
                  {d.overdue}
                </td>
                <td className="py-2.5 pr-3">{d.resolved}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-9 shrink-0 text-xs font-semibold ${TONE_TEXT[tone]}`}>
                      {formatPercent(d.resolution_rate)}
                    </span>
                    <RateBar rate={d.resolution_rate} tone={tone} />
                  </div>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-xs">{formatHours(d.avg_resolution_hours)}</td>
                <td className="py-2.5 text-xs">{d.sla_breaches}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

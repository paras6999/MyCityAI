import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { getWardSummary } from '../api/summary'
import { RateBar, Section } from '../components/summary/Section'
import { WardHeatmap } from '../components/summary/WardHeatmap'
import { formatPercent, rateTone, TONE_TEXT } from '../lib/format'

/** Mayor: every ward on the map plus a table, most pending first. */
export function WardsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isError } = useQuery({ queryKey: ['summary', 'wards'], queryFn: getWardSummary })
  const sorted = [...(data ?? [])].sort((a, b) => b.pending - a.pending || a.number - b.number)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('nav.wardHeatmap')}</h1>
        <p className="mt-1 text-sm text-muted">{t('overview.heatmapHint')}</p>
      </div>
      {isError && <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{t('overview.loadError')}</p>}

      <Section title={t('overview.heatmap')}>
        {data ? (
          <WardHeatmap
            wards={data}
            height="h-[28rem]"
            onSelect={(w) => navigate(`/mayor/complaints?ward_id=${w.ward_id}`)}
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
        )}
      </Section>

      <Section title={t('overview.wardTable')}>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted">
                <th className="py-2 pr-3">{t('overview.col.ward')}</th>
                <th className="py-2 pr-3">{t('overview.col.pending')}</th>
                <th className="py-2 pr-3">{t('overview.col.overdue')}</th>
                <th className="py-2 pr-3">{t('overview.col.escalated')}</th>
                <th className="py-2 pr-3">{t('overview.col.resolved')}</th>
                <th className="w-44 py-2">{t('overview.col.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const tone = rateTone(w.resolution_rate, w.total)
                return (
                  <tr key={w.ward_id} className="border-b border-neutral-bg last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link to={`/mayor/complaints?ward_id=${w.ward_id}`} className="font-medium hover:text-primary">
                        {t('overview.wardLabel', { number: w.number, name: w.name })}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{w.pending}</td>
                    <td className={`py-2.5 pr-3 ${w.overdue ? 'font-semibold text-danger' : ''}`}>{w.overdue}</td>
                    <td className="py-2.5 pr-3">{w.escalated}</td>
                    <td className="py-2.5 pr-3">{w.resolved}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-9 shrink-0 text-xs font-semibold ${TONE_TEXT[tone]}`}>
                          {w.total ? formatPercent(w.resolution_rate) : '—'}
                        </span>
                        <RateBar rate={w.resolution_rate} tone={tone} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

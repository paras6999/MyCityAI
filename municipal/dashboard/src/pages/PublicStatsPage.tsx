import { useQuery } from '@tanstack/react-query'
import { Building2, CheckCircle2, Clock, Inbox, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { getPublicStats } from '../api/summary'
import type { PublicStats } from '../api/types'
import { RateBar, Section } from '../components/summary/Section'
import { formatHours, formatPercent, rateTone, TONE_TEXT } from '../lib/format'

const THIS_YEAR = new Date().getFullYear()
const YEARS = [THIS_YEAR, THIS_YEAR - 1]
const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'short' })

function MonthlyChart({ monthly }: { monthly: PublicStats['monthly'] }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...monthly.map((m) => Math.max(m.received, m.resolved)))
  return (
    <div>
      <div className="flex h-48 items-end gap-1.5 sm:gap-3" role="img" aria-label={t('stats.monthlyLabel')}>
        {monthly.map((m) => (
          <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-0.5">
              <div
                className="w-1/2 max-w-4 rounded-t bg-primary/70"
                style={{ height: `${(m.received / max) * 100}%` }}
                title={`${t('stats.received')}: ${m.received}`}
              />
              <div
                className="w-1/2 max-w-4 rounded-t bg-success"
                style={{ height: `${(m.resolved / max) * 100}%` }}
                title={`${t('stats.resolvedLabel')}: ${m.resolved}`}
              />
            </div>
            <div className="mt-1 truncate text-center text-[10px] text-muted">
              {monthLabel.format(new Date(`${m.month}-01T00:00:00`))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/70" aria-hidden />
          {t('stats.received')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" aria-hidden />
          {t('stats.resolvedLabel')}
        </span>
      </div>
    </div>
  )
}

/** Public city statistics (API.md §8). No login: anyone can check how the city is doing. */
export function PublicStatsPage() {
  const { t } = useTranslation()
  const [year, setYear] = useState(String(THIS_YEAR))
  const { data, isError, isPending } = useQuery({
    queryKey: ['public-stats', year],
    queryFn: () => getPublicStats(year),
  })

  const tiles = data
    ? [
        { key: 'total', value: data.total_complaints.toLocaleString('en-IN'), icon: Inbox, tone: 'bg-info-bg text-info' },
        { key: 'resolved', value: `${data.resolved.toLocaleString('en-IN')} (${formatPercent(data.resolution_rate)})`, icon: CheckCircle2, tone: 'bg-success-bg text-success' },
        { key: 'avgTime', value: formatHours(data.avg_resolution_hours), icon: Clock, tone: 'bg-warning-bg text-warning' },
        {
          key: 'satisfaction',
          value: data.satisfaction_avg === null ? '—' : `${data.satisfaction_avg} / 5`,
          icon: Star,
          tone: 'bg-accent-light text-accent',
        },
      ]
    : []

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Building2 size={20} aria-hidden />
            </span>
            <div>
              <div className="font-bold">{t('app.name')}</div>
              <div className="text-xs text-sky-300">{t('stats.subtitle')}</div>
            </div>
          </div>
          <Link to="/login" className="text-xs font-semibold text-sky-200 hover:text-white">
            {t('stats.staffLogin')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('stats.title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('stats.description')}</p>
          </div>
          <label className="text-xs text-muted">
            <span className="sr-only">{t('stats.period')}</span>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isError && <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{t('overview.loadError')}</p>}
        {isPending && <p className="py-10 text-center text-sm text-muted">{t('common.loading')}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map(({ key, value, icon: Icon, tone }) => (
                <div key={key} className="flex min-w-0 items-center gap-3 rounded-xl bg-surface p-4 shadow-sm">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                    <Icon size={20} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold leading-tight">{value}</span>
                    <span className="block truncate text-xs text-muted">{t(`stats.${key}`)}</span>
                  </span>
                </div>
              ))}
            </div>

            <Section title={t('stats.monthly')}>
              <MonthlyChart monthly={data.monthly} />
            </Section>

            <div className="grid gap-4 md:grid-cols-2">
              <Section title={t('stats.departments')}>
                {data.by_department.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">{t('overview.noData')}</p>
                ) : (
                  <ul className="space-y-3">
                    {data.by_department.map((d) => {
                      const tone = rateTone(d.resolution_rate, d.total)
                      return (
                        <li key={d.department}>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="font-medium">{t(`departments.${d.department}`)}</span>
                            <span className={`text-xs font-semibold ${TONE_TEXT[tone]}`}>
                              {formatPercent(d.resolution_rate)}
                            </span>
                          </div>
                          <div className="mt-1">
                            <RateBar rate={d.resolution_rate} tone={tone} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              <Section title={t('stats.topWards')}>
                {data.top_wards.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">{t('overview.noData')}</p>
                ) : (
                  <ol className="divide-y divide-neutral-bg">
                    {data.top_wards.map((w, index) => (
                      <li key={w.ward_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="w-4 font-bold text-muted">{index + 1}</span>
                          <span className="truncate font-medium">
                            {t('overview.wardLabel', { number: w.number, name: w.name })}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {t('stats.wardResolved', { count: w.resolved, rate: formatPercent(w.resolution_rate) })}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>

            <p className="text-center text-xs text-faint">{t('stats.privacy')}</p>
          </>
        )}
      </main>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Droplets, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import type { Sensor, SensorKind } from '../api/types'
import { getSensor, listSensors, listSuggestions } from '../api/utilities'
import { AiSuggestions } from '../components/AiSuggestions'
import { SensorChart } from '../components/SensorChart'
import { Section } from '../components/summary/Section'
import { useWards } from '../hooks/useWards'
import { formatDateTime, formatPercent } from '../lib/format'

const KIND_ICON = { water_flow: Droplets, power_load: Zap }

function StatusDot({ sensor }: { sensor: Sensor }) {
  const { t } = useTranslation()
  if (sensor.status === 'anomaly') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-semibold text-danger">
        <AlertTriangle size={11} aria-hidden />
        {t('utilities.status.anomaly')}
      </span>
    )
  }
  const tone = sensor.status === 'normal' ? 'bg-success-bg text-success' : 'bg-neutral-bg text-neutral'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {t(`utilities.status.${sensor.status}`)}
    </span>
  )
}

/**
 * Utilities agent view: ward water / power sensors, live status, 7-day chart with the normal
 * pattern and the next-24-h demand forecast (API.md §6.10). Officers see their department only.
 */
export function UtilitiesPage() {
  const { t } = useTranslation()
  const { byId: wards } = useWards()
  const [params, setParams] = useSearchParams()
  const kind = (params.get('kind') as SensorKind) || undefined

  const sensors = useQuery({ queryKey: ['sensors', kind], queryFn: () => listSensors(kind) })
  const suggestions = useQuery({ queryKey: ['suggestions'], queryFn: listSuggestions })
  const list = [...(sensors.data ?? [])].sort(
    (a, b) => Number(b.status === 'anomaly') - Number(a.status === 'anomaly') || b.capacity_risk - a.capacity_risk,
  )
  const selectedId = Number(params.get('sensor')) || list[0]?.id
  const selected = list.find((s) => s.id === selectedId)
  const detail = useQuery({
    queryKey: ['sensors', 'detail', selectedId],
    queryFn: () => getSensor(selectedId as number),
    enabled: Boolean(selectedId),
  })
  const anomaly = suggestions.data?.find((s) => s.ref.sensor_id === selectedId && s.type === 'anomaly')

  function select(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'kind') next.delete('sensor')
    setParams(next, { replace: true })
  }

  const kinds: (SensorKind | '')[] = ['', 'water_flow', 'power_load']

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('nav.utilities')}</h1>
        <p className="mt-1 text-sm text-muted">{t('utilities.subtitle')}</p>
      </div>

      <AiSuggestions />

      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k || 'all'}
            type="button"
            onClick={() => select('kind', k || null)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              (kind ?? '') === k ? 'bg-primary text-white' : 'bg-surface text-muted shadow-sm hover:text-text'
            }`}
          >
            {t(k ? `utilities.kind.${k}` : 'utilities.kind.all')}
          </button>
        ))}
      </div>

      {sensors.isError && (
        <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{t('overview.loadError')}</p>
      )}
      {sensors.data && list.length === 0 && (
        <p className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted shadow-sm">
          {t('utilities.noSensors')}
        </p>
      )}

      {list.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Section title={t('utilities.sensors', { count: list.length })} className="lg:max-h-[34rem] lg:overflow-y-auto">
            <ul className="-mx-2 space-y-1">
              {list.map((s) => {
                const Icon = KIND_ICON[s.kind]
                const ward = s.ward_id ? wards.get(s.ward_id) : undefined
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => select('sensor', String(s.id))}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                        s.id === selectedId ? 'bg-primary-light' : 'hover:bg-neutral-bg'
                      }`}
                    >
                      <Icon size={16} className={s.kind === 'water_flow' ? 'text-info' : 'text-warning'} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {ward ? t('overview.wardLabel', { number: ward.number, name: ward.name }) : s.code}
                        </span>
                        <span className="block text-xs text-muted">
                          {s.code} · {s.last_value ?? '—'} {s.unit}
                        </span>
                      </span>
                      <StatusDot sensor={s} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>

          {selected && (
            <Section title={selected.name}>
              <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">{t('utilities.latest')}</dt>
                  <dd className="font-semibold">
                    {selected.last_value ?? '—'} {selected.unit}
                  </dd>
                  {selected.last_ts && <dd className="text-xs text-faint">{formatDateTime(selected.last_ts)}</dd>}
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('utilities.forecastPeak')}</dt>
                  <dd className="font-semibold">
                    {selected.forecast_peak ?? '—'} {selected.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('utilities.capacity')}</dt>
                  <dd className="font-semibold">
                    {selected.capacity} {selected.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('utilities.capacityRisk')}</dt>
                  <dd className={`font-semibold ${selected.capacity_risk > 0 ? 'text-danger' : 'text-success'}`}>
                    {formatPercent(selected.capacity_risk)}
                  </dd>
                </div>
              </dl>
              {detail.data ? (
                <SensorChart detail={detail.data} anomalySince={anomaly?.ref.since} />
              ) : (
                <p className="py-10 text-center text-sm text-muted">{t('common.loading')}</p>
              )}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

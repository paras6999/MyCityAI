import { type MouseEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SensorDetail } from '../api/types'
import { formatDateTime } from '../lib/format'

const W = 800
const H = 260
const PAD = { left: 48, right: 12, top: 12, bottom: 28 }
const dayLabel = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })

/**
 * Readings (solid), normal / expected values (grey dashed), next-24-h forecast (purple),
 * capacity (red line) and the anomaly period (red band). Plain SVG, no chart library.
 */
export function SensorChart({ detail, anomalySince }: { detail: SensorDetail; anomalySince?: string }) {
  const { t } = useTranslation()
  const [hover, setHover] = useState<number | null>(null)
  const { readings, forecast, sensor } = detail
  const times = [...readings.map((r) => r.ts), ...forecast.points.map((p) => p.ts)].map((ts) =>
    new Date(ts).getTime(),
  )
  if (times.length < 2) return <p className="py-10 text-center text-sm text-muted">{t('utilities.noData')}</p>

  const t0 = times[0]
  const t1 = times[times.length - 1]
  const maxValue =
    Math.max(
      sensor.capacity,
      ...readings.map((r) => Math.max(r.value, r.expected ?? 0)),
      ...forecast.points.map((p) => p.value),
    ) * 1.05
  const x = (ms: number) => PAD.left + ((ms - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
  const y = (v: number) => H - PAD.bottom - (v / maxValue) * (H - PAD.top - PAD.bottom)
  const line = (points: { ts: string; v: number | null }[]) =>
    points
      .filter((p) => p.v !== null)
      .map((p, i) => `${i ? 'L' : 'M'}${x(new Date(p.ts).getTime()).toFixed(1)},${y(p.v as number).toFixed(1)}`)
      .join(' ')

  const lastReading = readings[readings.length - 1]
  const actual = line(readings.map((r) => ({ ts: r.ts, v: r.value })))
  const expected = line(readings.map((r) => ({ ts: r.ts, v: r.expected })))
  const predicted = line([
    ...(lastReading ? [{ ts: lastReading.ts, v: lastReading.value }] : []),
    ...forecast.points.map((p) => ({ ts: p.ts, v: p.value })),
  ])

  // One tick per day at midnight (local time).
  const days: number[] = []
  const first = new Date(t0)
  first.setHours(24, 0, 0, 0)
  for (let d = first.getTime(); d < t1; d += 86_400_000) days.push(d)
  const yTicks = [0, maxValue / 2, maxValue].map((v) => Math.round(v))

  const hovered = hover === null ? null : readings[hover]
  function onMove(event: MouseEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const ms = t0 + (((event.clientX - box.left) / box.width) * W - PAD.left) / (W - PAD.left - PAD.right) * (t1 - t0)
    let best = 0
    readings.forEach((r, i) => {
      if (Math.abs(new Date(r.ts).getTime() - ms) < Math.abs(new Date(readings[best].ts).getTime() - ms)) best = i
    })
    setHover(readings.length ? best : null)
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={t('utilities.chartLabel', { name: sensor.name })}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {anomalySince && (
          <rect
            x={x(Math.max(t0, new Date(anomalySince).getTime()))}
            y={PAD.top}
            width={Math.max(2, x(new Date(lastReading.ts).getTime()) - x(Math.max(t0, new Date(anomalySince).getTime())))}
            height={H - PAD.top - PAD.bottom}
            fill="#fee2e2"
          />
        )}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {v}
            </text>
          </g>
        ))}
        {days.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={PAD.top} y2={H - PAD.bottom} stroke="#f1f5f9" />
            <text x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">
              {dayLabel.format(d)}
            </text>
          </g>
        ))}
        {lastReading && (
          <line
            x1={x(new Date(lastReading.ts).getTime())}
            x2={x(new Date(lastReading.ts).getTime())}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="#94a3b8"
            strokeDasharray="2 3"
          />
        )}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(sensor.capacity)}
          y2={y(sensor.capacity)}
          stroke="#b91c1c"
          strokeDasharray="6 4"
        />
        <path d={expected} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={actual} fill="none" stroke="#1d4ed8" strokeWidth="1.8" />
        <path d={predicted} fill="none" stroke="#6d28d9" strokeWidth="2" strokeDasharray="1 0" opacity="0.85" />
        {hovered && (
          <circle cx={x(new Date(hovered.ts).getTime())} cy={y(hovered.value)} r="4" fill="#1d4ed8" />
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <Legend colour="#1d4ed8" label={t('utilities.legend.actual')} />
        <Legend colour="#94a3b8" label={t('utilities.legend.expected')} dashed />
        <Legend colour="#6d28d9" label={t('utilities.legend.forecast', { method: t(`utilities.method.${forecast.method}`) })} />
        <Legend colour="#b91c1c" label={t('utilities.legend.capacity', { value: sensor.capacity, unit: sensor.unit })} dashed />
        {anomalySince && <Legend colour="#fca5a5" label={t('utilities.legend.anomaly')} />}
      </div>
      <p className="mt-1 h-4 text-xs text-text">
        {hovered &&
          t('utilities.hover', {
            time: formatDateTime(hovered.ts),
            value: hovered.value,
            expected: hovered.expected ?? '—',
            unit: sensor.unit,
          })}
      </p>
    </div>
  )
}

function Legend({ colour, label, dashed = false }: { colour: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden>
        <line x1="0" x2="18" y1="3" y2="3" stroke={colour} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} />
      </svg>
      {label}
    </span>
  )
}

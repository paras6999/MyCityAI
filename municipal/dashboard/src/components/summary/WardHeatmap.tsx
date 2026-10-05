import 'leaflet/dist/leaflet.css'

import { useTranslation } from 'react-i18next'
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'

import type { WardSummary } from '../../api/types'
import { formatPercent, rateTone, TONE_HEX, type Tone } from '../../lib/format'

const KOLHAPUR: [number, number] = [16.703, 74.243]

/**
 * One circle per ward centre: size = pending complaints, colour = resolution rate.
 * Ward centres are approximate (no official boundaries yet), so circles, not shapes.
 */
export function WardHeatmap({
  wards,
  height = 'h-80',
  onSelect,
}: {
  wards: WardSummary[]
  height?: string
  onSelect?: (ward: WardSummary) => void
}) {
  const { t } = useTranslation()
  const maxPending = Math.max(1, ...wards.map((w) => w.pending))
  const legend: Tone[] = ['success', 'warning', 'danger', 'neutral']

  return (
    <div>
      <MapContainer center={KOLHAPUR} zoom={13} scrollWheelZoom={false} className={`${height} w-full rounded-lg`}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {wards
          .filter((w) => w.lat !== null && w.lng !== null)
          .map((w) => {
            const colour = TONE_HEX[rateTone(w.resolution_rate, w.total)]
            return (
              <CircleMarker
                key={w.ward_id}
                center={[w.lat as number, w.lng as number]}
                radius={8 + 16 * Math.sqrt(w.pending / maxPending)}
                pathOptions={{ color: colour, fillColor: colour, fillOpacity: 0.45, weight: w.overdue ? 3 : 1.5 }}
                eventHandlers={onSelect ? { click: () => onSelect(w) } : undefined}
              >
                <Tooltip>
                  <strong>
                    {t('overview.wardLabel', { number: w.number, name: w.name })}
                  </strong>
                  <br />
                  {t('overview.tooltip', {
                    pending: w.pending,
                    overdue: w.overdue,
                    rate: w.total ? formatPercent(w.resolution_rate) : '—',
                  })}
                </Tooltip>
              </CircleMarker>
            )
          })}
      </MapContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {legend.map((tone) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE_HEX[tone] }} aria-hidden />
            {t(`overview.legend.${tone}`)}
          </span>
        ))}
        <span>{t('overview.legend.size')}</span>
      </div>
    </div>
  )
}

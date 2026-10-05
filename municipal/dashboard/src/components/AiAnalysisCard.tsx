import { Activity, MapPinned, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { AiInfo } from '../api/types'

/** AI triage result (docs/Design.md §5 "AI card": accent colours, always labelled as AI). */
export function AiAnalysisCard({ ai }: { ai: AiInfo }) {
  const { t } = useTranslation()
  const confidence = ai.category_confidence ?? 0
  const model = ai.model ?? 'keywords'

  return (
    <section className="rounded-xl border border-accent-border bg-accent-light/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Sparkles size={15} aria-hidden />
          {t('ai.title')}
        </h2>
        <span
          className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-accent"
          title={t(`ai.${model}Hint`)}
        >
          {t(`ai.${model}`)}
        </span>
      </div>

      <p className="text-sm">{ai.summary ?? <span className="text-muted">{t('ai.noSummary')}</span>}</p>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        {ai.category_confidence !== null && (
        <div>
          <dt className="text-muted">{t('ai.confidence')}</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </span>
            <span className="font-semibold">{Math.round(confidence * 100)}%</span>
          </dd>
        </div>
        )}
        {ai.severity !== null && (
          <div>
            <dt className="text-muted">{t('ai.severity')}</dt>
            <dd className="mt-1 font-semibold">{ai.severity} / 100</dd>
          </div>
        )}
      </dl>

      {ai.detected_objects.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-muted">{t('ai.objects')}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ai.detected_objects.map((label) => (
              <span key={label} className="rounded-full bg-surface px-2 py-0.5 text-xs">
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {(ai.forecast_risk ?? 0) > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent">
          <Activity size={14} aria-hidden />
          {t('ai.forecastRisk', { points: Math.round((ai.forecast_risk ?? 0) * 10) })}
        </p>
      )}

      {ai.sensitive_location && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-warning">
          <MapPinned size={14} aria-hidden />
          {t('ai.sensitive')}
        </p>
      )}
    </section>
  )
}

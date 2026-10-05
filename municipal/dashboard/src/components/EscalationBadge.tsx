import { ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** "↑ Ward rep" / "↑ Mayor" once a complaint has been escalated (API.md §2.6). */
export function EscalationBadge({ level }: { level: number }) {
  const { t } = useTranslation()
  if (level <= 0) return null
  const top = level >= 2
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        top ? 'bg-critical-bg text-critical' : 'bg-accent-light text-accent'
      }`}
      title={t('escalation.title')}
    >
      <ArrowUp size={11} aria-hidden />
      {t(top ? 'escalation.level2' : 'escalation.level1')}
    </span>
  )
}

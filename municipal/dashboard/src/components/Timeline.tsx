import { useTranslation } from 'react-i18next'

import type { TimelineEvent } from '../api/types'
import { formatDateTime } from '../lib/format'

/** Vertical timeline of complaint events, oldest first (docs/Design.md §5 "Timeline"). */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  const { t } = useTranslation()

  function title(event: TimelineEvent): string {
    if (event.type === 'status_changed' && event.to_status) {
      return t('timeline.statusChanged', { status: t(`status.${event.to_status}`) })
    }
    return t(`timeline.${event.type}`, { defaultValue: event.type })
  }

  return (
    <ol className="relative space-y-4 pl-5">
      {events.map((event, index) => (
        <li key={event.id} className="relative">
          {index < events.length - 1 && (
            <span className="absolute -left-[15px] top-4 h-[calc(100%+4px)] w-0.5 bg-border" />
          )}
          <span
            className={`absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full ${
              index === events.length - 1 ? 'bg-warning' : 'bg-success'
            }`}
          />
          <div className="text-sm font-medium">{title(event)}</div>
          {event.note && <div className="mt-0.5 text-sm text-text">{event.note}</div>}
          <div className="mt-0.5 text-xs text-muted">
            {formatDateTime(event.created_at)}
            {event.actor && ` · ${event.actor.name ?? t(`roles.${event.actor.role}`)}`}
          </div>
        </li>
      ))}
    </ol>
  )
}

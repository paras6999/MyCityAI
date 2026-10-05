import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { TONE_BAR, type Tone } from '../../lib/format'

/** White card with a title and an optional "View all" link. */
export function Section({
  title,
  link,
  linkLabel,
  children,
  className = '',
}: {
  title: string
  link?: string
  linkLabel?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`min-w-0 rounded-xl bg-surface p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {link && (
          <Link to={link} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function RateBar({ rate, tone }: { rate: number; tone: Tone }) {
  return (
    <div className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
      <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.round(rate * 100)}%` }} />
    </div>
  )
}

// Date and time helpers. Times are shown in the browser's time zone (Asia/Kolkata for users in India).

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** Hours left until the SLA deadline (negative when overdue). */
export function hoursUntil(iso: string, now: number = Date.now()): number {
  return (new Date(iso).getTime() - now) / 3_600_000
}

/** "3 h", "2 d 4 h", "45 min" */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) return `${totalHours} h`
  return `${Math.floor(totalHours / 24)} d ${totalHours % 24} h`
}

/** 0.863 → "86%" */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** Average resolution time, or "—" when there is no data yet. */
export function formatHours(hours: number | null): string {
  return hours === null ? '—' : formatDuration(hours)
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral'

/** Resolution rate colour: green ≥ 85%, amber ≥ 70%, red below, grey without data. */
export function rateTone(rate: number, total = 1): Tone {
  if (total === 0) return 'neutral'
  if (rate >= 0.85) return 'success'
  if (rate >= 0.7) return 'warning'
  return 'danger'
}

// Full class names so Tailwind finds them in the source.
export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-neutral',
}
export const TONE_BAR: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-faint',
}
/** Hex colours for the map (Leaflet cannot use CSS classes). */
export const TONE_HEX: Record<Tone, string> = {
  success: '#15803d',
  warning: '#d97706',
  danger: '#b91c1c',
  neutral: '#94a3b8',
}

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

import type { Language } from '../api/types'

const LOCALES: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }

export function formatDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(LOCALES[lang], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(iso: string, lang: Language): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'second')
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function shortLocation(address: string | null, lat: number, lng: number): string {
  return address?.trim() || formatCoords(lat, lng)
}

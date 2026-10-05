import { request } from './client'
import type { Announcement, Department, Page } from './types'

/** GET /stats/public (docs/API.md §8): no login, counts and rates only. Rates are fractions 0–1. */
export interface PublicStats {
  period: string
  total_complaints: number
  resolved: number
  pending: number
  resolution_rate: number
  avg_resolution_hours: number | null
  satisfaction_avg: number | null
  ratings_count: number
  monthly: { month: string; received: number; resolved: number }[]
  by_department: { department: Department; total: number; resolution_rate: number; avg_resolution_hours: number | null }[]
  top_wards: { ward_id: number; number: number; name: string; resolved: number; resolution_rate: number }[]
  generated_at: string
}

export const statsApi = {
  public: (period?: string) =>
    request<PublicStats>('GET', '/stats/public', { query: { period }, auth: false }),
}

export const announcementsApi = {
  /** The citizen's ward and city-wide announcements, emergency first (docs/API.md §7). */
  list: () =>
    request<Page<Announcement>>('GET', '/announcements', { query: { active: 'true', page_size: 20 } }),
}

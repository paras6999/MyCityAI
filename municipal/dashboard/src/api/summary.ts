import { api } from './client'
import type {
  CategoryCount,
  DepartmentSummary,
  ListResponse,
  PublicStats,
  SummaryKpis,
  WardSummary,
} from './types'

// Dashboard summaries (API.md §6.8) and public statistics (§8).

export async function getKpis(wardId?: number): Promise<SummaryKpis> {
  const { data } = await api.get<SummaryKpis>('/staff/summary', { params: { ward_id: wardId } })
  return data
}

export async function getDepartmentSummary(wardId?: number): Promise<DepartmentSummary[]> {
  const { data } = await api.get<ListResponse<DepartmentSummary>>('/staff/summary/departments', {
    params: { ward_id: wardId },
  })
  return data.items
}

export async function getWardSummary(): Promise<WardSummary[]> {
  const { data } = await api.get<ListResponse<WardSummary>>('/staff/summary/wards')
  return data.items
}

export async function getCategorySummary(wardId?: number): Promise<CategoryCount[]> {
  const { data } = await api.get<ListResponse<CategoryCount>>('/staff/summary/categories', {
    params: { ward_id: wardId },
  })
  return data.items
}

/** No login needed. `period`: "2026" or "2026-09". */
export async function getPublicStats(period?: string): Promise<PublicStats> {
  const { data } = await api.get<PublicStats>('/stats/public', { params: { period } })
  return data
}

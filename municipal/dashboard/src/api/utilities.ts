import { api } from './client'
import type { AiSuggestion, Complaint, ListResponse, Sensor, SensorDetail, SensorKind } from './types'

// Utilities agent (API.md §6.9 AI suggestions, §6.10 sensors).

export async function listSensors(kind?: SensorKind): Promise<Sensor[]> {
  const { data } = await api.get<ListResponse<Sensor>>('/staff/utilities/sensors', { params: { kind } })
  return data.items
}

export async function getSensor(id: number, hours = 168): Promise<SensorDetail> {
  const { data } = await api.get<SensorDetail>(`/staff/utilities/sensors/${id}`, { params: { hours } })
  return data
}

export async function listSuggestions(): Promise<AiSuggestion[]> {
  const { data } = await api.get<ListResponse<AiSuggestion>>('/staff/ai-suggestions')
  return data.items
}

export async function dismissSuggestion(id: number): Promise<void> {
  await api.post(`/staff/ai-suggestions/${id}/dismiss`)
}

/** Sensor anomaly → complaint in the department queue (officer / mayor / admin). */
export async function createWorkOrder(id: number): Promise<Complaint> {
  const { data } = await api.post<Complaint>(`/staff/ai-suggestions/${id}/work-order`)
  return data
}

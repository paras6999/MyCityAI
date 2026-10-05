import { api, API_URL } from './client'
import type {
  Category,
  Complaint,
  ComplaintUpdate,
  Department,
  ListResponse,
  Page,
  PriorityLevel,
  ProofResponse,
  Status,
  TimelineEvent,
  User,
} from './types'

/** Query parameters of GET /staff/complaints (API.md §6.2). */
export interface ComplaintFilters {
  status?: Status
  category?: Category
  department?: Department
  ward_id?: number
  priority_level?: PriorityLevel
  sla?: 'overdue' | 'due_soon'
  q?: string
  sort?: 'priority' | 'created_at' | 'sla_due_at'
  page?: number
  page_size?: number
}

export async function listComplaints(filters: ComplaintFilters): Promise<Page<Complaint>> {
  const { data } = await api.get<Page<Complaint>>('/staff/complaints', { params: filters })
  return data
}

export async function getComplaint(id: number): Promise<Complaint> {
  const { data } = await api.get<Complaint>(`/staff/complaints/${id}`)
  return data
}

export async function getTimeline(id: number): Promise<TimelineEvent[]> {
  const { data } = await api.get<ListResponse<TimelineEvent>>(`/staff/complaints/${id}/timeline`)
  return data.items
}

export async function getDuplicates(id: number): Promise<Complaint[]> {
  const { data } = await api.get<ListResponse<Complaint>>(`/staff/complaints/${id}/duplicates`)
  return data.items
}

export async function updateComplaint(id: number, body: ComplaintUpdate): Promise<Complaint> {
  const { data } = await api.patch<Complaint>(`/staff/complaints/${id}`, body)
  return data
}

/** Where and when the after-photo was taken (API.md §5.6 live photo rules). */
export interface CaptureInfo {
  lat?: number
  lng?: number
  accuracyM?: number
  capturedAt?: string
}

export async function uploadProof(
  id: number,
  photo: File,
  note: string,
  capture: CaptureInfo,
): Promise<ProofResponse> {
  const form = new FormData()
  form.append('after_photo', photo)
  if (note) form.append('note', note)
  if (capture.lat !== undefined && capture.lng !== undefined) {
    form.append('lat', String(capture.lat))
    form.append('lng', String(capture.lng))
  }
  if (capture.accuracyM !== undefined) form.append('location_accuracy_m', String(capture.accuracyM))
  if (capture.capturedAt) form.append('captured_at', capture.capturedAt)
  const { data } = await api.post<ProofResponse>(`/staff/complaints/${id}/proof`, form)
  return data
}

export async function addComment(id: number, note: string): Promise<Complaint> {
  const { data } = await api.post<Complaint>(`/staff/complaints/${id}/comments`, { note })
  return data
}

export async function listOfficers(department: Department): Promise<User[]> {
  const { data } = await api.get<ListResponse<User>>('/staff/users', {
    params: { department, role: 'officer' },
  })
  return data.items
}

/** photo_url from the API is a server path like /media/...; images need the full origin. */
export function mediaUrl(path: string | null): string | null {
  if (!path) return null
  return new URL(path, API_URL).toString()
}

import { api, API_URL } from './client'
import type {
  Category,
  Complaint,
  ComplaintUpdate,
  Department,
  ListResponse,
  Page,
  PriorityLevel,
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

export async function updateComplaint(id: number, body: ComplaintUpdate): Promise<Complaint> {
  const { data } = await api.patch<Complaint>(`/staff/complaints/${id}`, body)
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

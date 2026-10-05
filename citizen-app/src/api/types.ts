// Mirrors docs/API.md §2-§3 and shared/constants.json. Do not invent fields here.

export type Language = 'en' | 'mr' | 'hi'
export type Department = 'water' | 'roads' | 'waste' | 'electricity' | 'drainage' | 'health' | 'other'
export type Category =
  | 'pothole' | 'road_damage' | 'garbage' | 'illegal_dumping' | 'water_leakage' | 'no_water_supply'
  | 'pipeline_burst' | 'contaminated_water' | 'streetlight' | 'power_outage' | 'drainage_overflow'
  | 'waterlogging' | 'fallen_tree' | 'stray_animals' | 'other'
export type Status = 'new' | 'merged' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'reopened' | 'rejected'
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface User {
  id: number
  name: string | null
  phone: string | null
  role: string
  department: Department | null
  ward_id: number | null
  language: Language
  created_at: string
}

export interface Ward {
  id: number
  number: number
  name: string
  rep_user_id: number | null
}

export interface Location {
  lat: number
  lng: number
  address: string | null
  ward_id: number | null
}

export interface Complaint {
  id: number
  code: string
  source: string
  description: string | null
  category: Category
  department: Department
  location: Location
  photo_url: string | null
  status: Status
  priority_score: number
  priority_level: PriorityLevel
  ai: { category_confidence: number | null; summary: string | null } | null
  duplicate_count: number
  merged_into_id: number | null
  assigned_to: { name: string | null } | null
  sla_hours: number
  sla_due_at: string
  proof: Record<string, unknown> | null
  feedback: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface TimelineEvent {
  id: number
  complaint_id: number
  type: string
  from_status: Status | null
  to_status: Status | null
  note: string | null
  actor: { id: number; name: string | null; role: string } | null
  created_at: string
}

export interface Page<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}
export interface OtpTokenResponse extends TokenResponse {
  is_new_user: boolean
}

export interface Detection {
  label: Category
  confidence: number
  box: number[]
}
export interface DuplicateHint {
  id: number
  code: string
  category: Category
  distance_m: number
  status: Status
}
export interface AnalyzeResult {
  suggested_category: Category
  department: Department
  confidence: number
  priority_level: PriorityLevel
  summary: string | null
  is_civic_issue: boolean
  detections: Detection[]
  nearby_duplicates: DuplicateHint[]
  active_announcement: Record<string, unknown> | null
}

export interface Announcement {
  id: number
  title: string
  body: string
  priority: 'emergency' | 'important' | 'general'
  [key: string]: unknown
}

export interface HomeSummary {
  open_complaints: number
  recent_complaints: Complaint[]
  announcements: Announcement[]
  ward: { id: number; number: number; name: string } | null
}

/** A photo chosen by the citizen, ready to upload. */
export interface PickedPhoto {
  uri: string
  mimeType: 'image/jpeg' | 'image/png'
  fileName: string
  sizeBytes?: number
}

export interface SubmitInput {
  photo: PickedPhoto
  lat: number
  lng: number
  description?: string
  address?: string
  category?: Category
  language?: Language
}

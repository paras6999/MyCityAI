// Types copied from docs/API.md. Keep names and values identical to the contract.

/** API.md §2.1 */
export type Role = 'citizen' | 'officer' | 'ward_rep' | 'mayor' | 'admin'
export type StaffRole = Exclude<Role, 'citizen'>

/** API.md §2.2 */
export type Department =
  | 'water'
  | 'roads'
  | 'waste'
  | 'electricity'
  | 'drainage'
  | 'health'
  | 'other'

/** API.md §2.8 */
export type Language = 'en' | 'mr' | 'hi'

/** API.md §1 — every error response body */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details: unknown
  }
}

export interface HealthResponse {
  status: 'ok'
  version: string
  database: 'ok' | 'unavailable'
}

/** API.md §3.1 */
export interface User {
  id: number
  name: string | null
  phone: string | null
  role: Role
  department: Department | null
  ward_id: number | null
  language: Language
  created_at: string
}

/** API.md §3.2 */
export interface Ward {
  id: number
  number: number
  name: string
  rep_user_id: number | null
}

/** API.md §4.2 */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface ListResponse<T> {
  items: T[]
}

/** API.md §1 pagination */
export interface Page<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

/** API.md §2.3 */
export const CATEGORIES = [
  'pothole',
  'road_damage',
  'garbage',
  'illegal_dumping',
  'water_leakage',
  'no_water_supply',
  'pipeline_burst',
  'contaminated_water',
  'streetlight',
  'power_outage',
  'drainage_overflow',
  'waterlogging',
  'fallen_tree',
  'stray_animals',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

/** API.md §2.4 */
export const STATUSES = [
  'new',
  'merged',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
  'reopened',
  'rejected',
] as const
export type Status = (typeof STATUSES)[number]

/** API.md §2.5 */
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical'

/** API.md §3.3 */
export interface Location {
  lat: number
  lng: number
  address: string | null
  ward_id: number | null
}

/** API.md §3.4 `ai` */
export interface AiInfo {
  category_confidence: number | null
  detected_objects: string[]
  summary: string | null
  severity: number | null
  sensitive_location: boolean
  model: 'gemini' | 'keywords' | null
}

/** API.md §3.4 */
export interface Complaint {
  id: number
  code: string
  source: 'citizen_app' | 'police_bridge' | 'sensor' | 'staff'
  description: string | null
  category: Category
  department: Department
  location: Location
  photo_url: string | null
  status: Status
  priority_score: number
  priority_level: PriorityLevel
  ai: AiInfo | null
  duplicate_count: number
  merged_into_id: number | null
  assigned_to: { id: number; name: string | null } | null
  sla_hours: number
  sla_due_at: string
  escalation_level: number
  proof: unknown
  feedback: unknown
  reporter: { id: number; name: string | null; phone_masked: string | null } | null
  created_at: string
  updated_at: string
}

/** API.md §3.6 */
export interface TimelineEvent {
  id: number
  complaint_id: number
  type: string
  from_status: Status | null
  to_status: Status | null
  note: string | null
  actor: { id: number; name: string | null; role: Role } | null
  created_at: string
}

/** API.md §6.4 */
export interface ComplaintUpdate {
  status?: Status
  assigned_to_id?: number | null
  note?: string
  category?: Category
  department?: Department
}

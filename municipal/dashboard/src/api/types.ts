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

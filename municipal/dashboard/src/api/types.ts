// Types copied from docs/API.md. Keep names and values identical to the contract.

/** API.md §2.1 */
export type Role = 'citizen' | 'officer' | 'ward_rep' | 'mayor' | 'admin'

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

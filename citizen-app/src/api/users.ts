// Profile endpoints live under /auth/me in the backend (docs/API.md §4.3); re-exported here for readability.
import { authApi } from './auth'

export const usersApi = {
  me: authApi.me,
  update: authApi.updateMe,
  wards: authApi.wards,
}

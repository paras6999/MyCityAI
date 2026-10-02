import type { Role, StaffRole } from '../api/types'

/** Landing page for each dashboard role. */
export const HOME_PATH: Record<StaffRole, string> = {
  officer: '/officer',
  ward_rep: '/ward',
  mayor: '/mayor',
  admin: '/admin',
}

export function homePathFor(role: Role): string {
  return role === 'citizen' ? '/login' : HOME_PATH[role]
}

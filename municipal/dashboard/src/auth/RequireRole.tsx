import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import type { StaffRole } from '../api/types'
import { FullPageSpinner } from '../components/FullPageSpinner'
import { useAuth } from './useAuth'
import { homePathFor } from './roles'

/** Renders children only for signed-in users with one of the given roles. */
export function RequireRole({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!(roles as string[]).includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return children
}

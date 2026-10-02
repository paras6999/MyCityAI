import { Navigate, Route, Routes } from 'react-router-dom'

import type { StaffRole } from './api/types'
import { useAuth } from './auth/useAuth'
import { RequireRole } from './auth/RequireRole'
import { HOME_PATH, homePathFor } from './auth/roles'
import { FullPageSpinner } from './components/FullPageSpinner'
import { DashboardLayout } from './layouts/DashboardLayout'
import { LoginPage } from './pages/LoginPage'
import { RoleHomePage } from './pages/RoleHomePage'

const ROLES = Object.keys(HOME_PATH) as StaffRole[]

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {ROLES.map((role) => (
        <Route
          key={role}
          path={HOME_PATH[role]}
          element={
            <RequireRole roles={[role]}>
              <DashboardLayout role={role} />
            </RequireRole>
          }
        >
          <Route index element={<RoleHomePage role={role} />} />
        </Route>
      ))}
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

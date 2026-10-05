import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import type { StaffRole } from './api/types'
import { RequireRole } from './auth/RequireRole'
import { homePathFor } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { FullPageSpinner } from './components/FullPageSpinner'
import { DashboardLayout } from './layouts/DashboardLayout'
import { AnnouncementsPage } from './pages/AnnouncementsPage'
import { ComplaintQueuePage } from './pages/ComplaintQueuePage'
import { LoginPage } from './pages/LoginPage'
import { RoleHomePage } from './pages/RoleHomePage'

// The detail page pulls in the map library, so it is loaded only when opened.
const ComplaintDetailPage = lazy(() =>
  import('./pages/ComplaintDetailPage').then((m) => ({ default: m.ComplaintDetailPage })),
)

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />
}

function RoleSection({ role }: { role: StaffRole }) {
  return (
    <RequireRole roles={[role]}>
      <DashboardLayout role={role} />
    </RequireRole>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/officer" element={<RoleSection role="officer" />}>
        <Route
          index
          element={<ComplaintQueuePage titleKey="nav.myComplaints" detailBase="/officer/complaints" />}
        />
        <Route path="complaints/:id" element={<ComplaintDetailPage backTo="/officer" />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/ward" element={<RoleSection role="ward_rep" />}>
        <Route index element={<RoleHomePage role="ward_rep" />} />
        <Route
          path="complaints"
          element={<ComplaintQueuePage titleKey="nav.allComplaints" detailBase="/ward/complaints" />}
        />
        <Route path="complaints/:id" element={<ComplaintDetailPage backTo="/ward/complaints" />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/mayor" element={<RoleSection role="mayor" />}>
        <Route index element={<RoleHomePage role="mayor" />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/admin" element={<RoleSection role="admin" />}>
        <Route index element={<RoleHomePage role="admin" />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

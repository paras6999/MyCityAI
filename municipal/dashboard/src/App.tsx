import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import type { StaffRole } from './api/types'
import { RequireRole } from './auth/RequireRole'
import { homePathFor } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { FullPageSpinner } from './components/FullPageSpinner'
import { AiSuggestions } from './components/AiSuggestions'
import { DashboardLayout } from './layouts/DashboardLayout'
import { AnnouncementsPage } from './pages/AnnouncementsPage'
import { ComplaintQueuePage } from './pages/ComplaintQueuePage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { PublicStatsPage } from './pages/PublicStatsPage'
import { RoleHomePage } from './pages/RoleHomePage'
import { UtilitiesPage } from './pages/UtilitiesPage'

// The detail page pulls in the map library, so it is loaded only when opened.
const ComplaintDetailPage = lazy(() =>
  import('./pages/ComplaintDetailPage').then((m) => ({ default: m.ComplaintDetailPage })),
)
const WardsPage = lazy(() => import('./pages/WardsPage').then((m) => ({ default: m.WardsPage })))

// Escalation inbox: open complaints above officer level (the mayor's list: level 2 only).
const ESCALATED = { escalated: true, sort: 'sla_due_at' } as const

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
      <Route path="/stats" element={<PublicStatsPage />} />

      <Route path="/officer" element={<RoleSection role="officer" />}>
        <Route
          index
          element={
            <ComplaintQueuePage
              titleKey="nav.myComplaints"
              detailBase="/officer/complaints"
              header={<AiSuggestions />}
            />
          }
        />
        <Route path="complaints/:id" element={<ComplaintDetailPage backTo="/officer" />} />
        <Route
          path="escalations"
          element={
            <ComplaintQueuePage
              titleKey="nav.escalations"
              subtitleKey="queue.escalationsOfficer"
              detailBase="/officer/complaints"
              fixed={ESCALATED}
            />
          }
        />
        <Route path="performance" element={<OverviewPage role="officer" />} />
        <Route path="utilities" element={<UtilitiesPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/ward" element={<RoleSection role="ward_rep" />}>
        <Route index element={<OverviewPage role="ward_rep" />} />
        <Route
          path="escalations"
          element={
            <ComplaintQueuePage
              titleKey="nav.escalations"
              subtitleKey="queue.escalationsWard"
              detailBase="/ward/complaints"
              fixed={ESCALATED}
            />
          }
        />
        <Route path="utilities" element={<UtilitiesPage />} />
        <Route
          path="complaints"
          element={<ComplaintQueuePage titleKey="nav.allComplaints" detailBase="/ward/complaints" />}
        />
        <Route path="complaints/:id" element={<ComplaintDetailPage backTo="/ward/complaints" />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/mayor" element={<RoleSection role="mayor" />}>
        <Route index element={<OverviewPage role="mayor" />} />
        <Route path="wards" element={<WardsPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="utilities" element={<UtilitiesPage />} />
        <Route
          path="escalations"
          element={
            <ComplaintQueuePage
              titleKey="nav.finalEscalations"
              subtitleKey="queue.escalationsMayor"
              detailBase="/mayor/complaints"
              fixed={{ ...ESCALATED, escalation_level: 2 }}
              wardFilter
            />
          }
        />
        <Route
          path="complaints"
          element={
            <ComplaintQueuePage titleKey="nav.allComplaints" detailBase="/mayor/complaints" wardFilter />
          }
        />
        <Route path="complaints/:id" element={<ComplaintDetailPage backTo="/mayor/complaints" />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/admin" element={<RoleSection role="admin" />}>
        <Route index element={<RoleHomePage role="admin" />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building,
  ClipboardList,
  Gauge,
  Home,
  Map,
  Megaphone,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { StaffRole } from '../api/types'

export interface NavItem {
  /** i18n key under `nav.` */
  key: string
  icon: LucideIcon
  /** Undefined = not built yet (shown as "Soon"). */
  path?: string
  /** Only highlight on the exact path (for role home pages that have sub-pages). */
  end?: boolean
}

// Sidebar items per role, from docs/Design.md §8.
export const NAVIGATION: Record<StaffRole, NavItem[]> = {
  officer: [
    { key: 'myComplaints', icon: ClipboardList, path: '/officer', end: true },
    { key: 'mapView', icon: Map },
    { key: 'utilities', icon: Activity, path: '/officer/utilities' },
    { key: 'announcements', icon: Megaphone, path: '/officer/announcements' },
    { key: 'escalations', icon: AlertTriangle, path: '/officer/escalations' },
    { key: 'performance', icon: BarChart3, path: '/officer/performance' },
    { key: 'infraInsights', icon: Sparkles },
  ],
  ward_rep: [
    { key: 'wardOverview', icon: Home, path: '/ward', end: true },
    { key: 'escalations', icon: AlertTriangle, path: '/ward/escalations' },
    { key: 'allComplaints', icon: ClipboardList, path: '/ward/complaints' },
    { key: 'utilities', icon: Activity, path: '/ward/utilities' },
    { key: 'postAnnouncement', icon: Megaphone, path: '/ward/announcements' },
    { key: 'infraInsights', icon: Sparkles },
  ],
  mayor: [
    { key: 'cityOverview', icon: Gauge, path: '/mayor', end: true },
    { key: 'wardHeatmap', icon: Map, path: '/mayor/wards' },
    { key: 'departments', icon: Building, path: '/mayor/departments' },
    { key: 'utilities', icon: Activity, path: '/mayor/utilities' },
    { key: 'finalEscalations', icon: AlertTriangle, path: '/mayor/escalations' },
    { key: 'allComplaints', icon: ClipboardList, path: '/mayor/complaints' },
    { key: 'infraInsights', icon: Sparkles },
    { key: 'cityAnnouncement', icon: Megaphone, path: '/mayor/announcements' },
  ],
  admin: [
    { key: 'users', icon: Users, path: '/admin' },
    { key: 'wards', icon: Map },
    { key: 'slaSettings', icon: Settings },
  ],
}

import {
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
    { key: 'announcements', icon: Megaphone, path: '/officer/announcements' },
    { key: 'escalations', icon: AlertTriangle },
    { key: 'performance', icon: BarChart3 },
    { key: 'infraInsights', icon: Sparkles },
  ],
  ward_rep: [
    { key: 'wardOverview', icon: Home, path: '/ward', end: true },
    { key: 'escalations', icon: AlertTriangle },
    { key: 'allComplaints', icon: ClipboardList, path: '/ward/complaints' },
    { key: 'postAnnouncement', icon: Megaphone, path: '/ward/announcements' },
    { key: 'infraInsights', icon: Sparkles },
  ],
  mayor: [
    { key: 'cityOverview', icon: Gauge, path: '/mayor', end: true },
    { key: 'wardHeatmap', icon: Map },
    { key: 'departments', icon: Building },
    { key: 'finalEscalations', icon: AlertTriangle },
    { key: 'infraInsights', icon: Sparkles },
    { key: 'cityAnnouncement', icon: Megaphone, path: '/mayor/announcements' },
  ],
  admin: [
    { key: 'users', icon: Users, path: '/admin' },
    { key: 'wards', icon: Map },
    { key: 'slaSettings', icon: Settings },
  ],
}

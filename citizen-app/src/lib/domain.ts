import type { ComponentProps } from 'react'
import type { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Category, PriorityLevel, Status } from '../api/types'
import type { Tone } from '../theme'
import type { TranslationKey } from '../i18n/en'
import { ApiError } from '../api/client'
import type { TFunction } from '../i18n'

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name']

/** The six citizen-facing issue types and the backend category each one maps to (shared/constants.json). */
export type IssueType = 'road' | 'streetlight' | 'water' | 'garbage' | 'drainage' | 'other'

export const ISSUE_TYPES: { type: IssueType; category: Category | undefined; icon: IconName }[] = [
  { type: 'road', category: 'road_damage', icon: 'road-variant' },
  { type: 'streetlight', category: 'streetlight', icon: 'lightbulb-on-outline' },
  { type: 'water', category: 'no_water_supply', icon: 'water-outline' },
  { type: 'garbage', category: 'garbage', icon: 'trash-can-outline' },
  { type: 'drainage', category: 'drainage_overflow', icon: 'pipe' },
  // "Other": no category is sent, so the AI decides (docs/API.md §5.2).
  { type: 'other', category: undefined, icon: 'dots-horizontal-circle-outline' },
]

export const CATEGORY_ICONS: Record<Category, IconName> = {
  pothole: 'road-variant', road_damage: 'road-variant', garbage: 'trash-can-outline',
  illegal_dumping: 'delete-alert-outline', water_leakage: 'water-alert-outline', no_water_supply: 'water-off-outline',
  pipeline_burst: 'pipe-leak', contaminated_water: 'water-opacity', streetlight: 'lightbulb-on-outline',
  power_outage: 'flash-off-outline', drainage_overflow: 'pipe', waterlogging: 'waves', fallen_tree: 'tree-outline',
  stray_animals: 'paw-outline', other: 'dots-horizontal-circle-outline',
}

export const STATUS_TONE: Record<Status, Tone> = {
  new: 'neutral', merged: 'neutral', assigned: 'warning', in_progress: 'info',
  resolved: 'accent', closed: 'success', reopened: 'danger', rejected: 'neutral',
}

export const PRIORITY_TONE: Record<PriorityLevel, Tone> = {
  low: 'success', medium: 'warning', high: 'danger', critical: 'critical',
}

/** Home / list tabs group the eight backend statuses into the three the citizen cares about. */
export type StatusGroup = 'all' | 'pending' | 'progress' | 'resolved'
export const STATUS_GROUPS: Record<Exclude<StatusGroup, 'all'>, Status[]> = {
  pending: ['new', 'merged', 'reopened'],
  progress: ['assigned', 'in_progress'],
  resolved: ['resolved', 'closed'],
}

export function groupOf(status: Status): Exclude<StatusGroup, 'all'> | 'other' {
  for (const [group, statuses] of Object.entries(STATUS_GROUPS)) {
    if (statuses.includes(status)) return group as Exclude<StatusGroup, 'all'>
  }
  return 'other'
}

export const categoryKey = (c: Category): TranslationKey => `cat.${c}`
export const statusKey = (s: Status): TranslationKey => `status.${s}`
export const priorityKey = (p: PriorityLevel): TranslationKey => `priority.${p}`

export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return t('common.offline')
    return error.message
  }
  return t('common.errorBody')
}

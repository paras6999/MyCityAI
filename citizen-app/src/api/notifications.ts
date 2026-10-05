import { complaintsApi } from './complaints'
import type { Complaint, TimelineEvent } from './types'
import { storage } from '../lib/storage'

// The backend has no notification-list endpoint yet (docs/API.md §10.2 only defines push delivery).
// The in-app list is therefore built from the timelines of the citizen's own complaints, which the
// backend already records for every status change. The "read" state is kept on the device.

export interface AppNotification {
  id: string
  complaintId: number
  code: string
  /** Timeline event type, or the target status for status changes. */
  kind: string
  createdAt: string
}

const READ_KEY = 'mycityai.read_notifications'
const MAX_COMPLAINTS = 10

function kindOf(event: TimelineEvent): string {
  return event.type === 'status_changed' && event.to_status ? event.to_status : event.type
}

export const notificationsApi = {
  async list(): Promise<AppNotification[]> {
    const { items: complaints } = await complaintsApi.list({ page_size: MAX_COMPLAINTS })
    const timelines = await Promise.all(
      complaints.map(async (c: Complaint) => ({ c, events: (await complaintsApi.timeline(c.id)).items })),
    )
    return timelines
      .flatMap(({ c, events }) =>
        events.map((e) => ({
          id: `${c.id}:${e.id}`,
          complaintId: c.id,
          code: c.code,
          kind: kindOf(e),
          createdAt: e.created_at,
        })),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
  },

  async readIds(): Promise<Set<string>> {
    try {
      return new Set(JSON.parse((await storage.get(READ_KEY)) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  },

  async saveReadIds(ids: Set<string>) {
    await storage.set(READ_KEY, JSON.stringify([...ids].slice(-200)))
  },
}

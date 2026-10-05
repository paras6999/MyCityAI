import { api } from './client'
import type { Announcement, AnnouncementTarget, Page } from './types'

export async function listAnnouncements(active: boolean): Promise<Page<Announcement>> {
  const { data } = await api.get<Page<Announcement>>('/announcements', {
    params: { active, page_size: 100 },
  })
  return data
}

export async function createAnnouncement(
  target: AnnouncementTarget,
  title: string,
  message: string,
  autoTranslate: boolean,
): Promise<Announcement> {
  const { data } = await api.post<Announcement>('/announcements', {
    ...target,
    title_en: title,
    message_en: message,
    auto_translate: autoTranslate,
  })
  return data
}

export async function draftAnnouncement(target: AnnouncementTarget, text: string): Promise<Announcement> {
  const { data } = await api.post<Announcement>('/announcements/draft', { ...target, text })
  return data
}

export async function publishAnnouncement(id: number): Promise<Announcement> {
  const { data } = await api.post<Announcement>(`/announcements/${id}/publish`)
  return data
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await api.delete(`/announcements/${id}`)
}

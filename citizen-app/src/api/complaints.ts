import { get, post, request } from './client'
import type {
  AnalyzeResult, Complaint, HomeSummary, Page, PickedPhoto, Status, SubmitInput, TimelineEvent,
} from './types'

/** Live-photo fields the backend checks (docs/API.md §5.6). The app only offers the camera. */
function liveFields(photo: PickedPhoto): Record<string, string | undefined> {
  return {
    captured_at: photo.capturedAt,
    location_accuracy_m: photo.accuracyM != null ? String(photo.accuracyM) : undefined,
    capture_source: 'camera',
  }
}

export const complaintsApi = {
  home: () => get<HomeSummary>('/citizen/home'),

  list: (params: { status?: Status; page?: number; page_size?: number } = {}) =>
    get<Page<Complaint>>('/citizen/complaints', params),

  detail: (id: number) => get<Complaint>(`/citizen/complaints/${id}`),

  timeline: (id: number) => get<{ items: TimelineEvent[] }>(`/citizen/complaints/${id}/timeline`),

  /** AI pre-check: category, priority, live-photo check and nearby duplicates. Saves nothing (docs/API.md §5.1). */
  analyze: (input: { photo: PickedPhoto; lat: number; lng: number; description?: string }) =>
    request<AnalyzeResult>('POST', '/citizen/complaints/analyze', {
      multipart: {
        file: { field: 'photo', photo: input.photo },
        fields: {
          lat: String(input.lat), lng: String(input.lng), description: input.description, ...liveFields(input.photo),
        },
      },
    }),

  submit: (input: SubmitInput) =>
    request<Complaint>('POST', '/citizen/complaints', {
      multipart: {
        file: { field: 'photo', photo: input.photo },
        fields: {
          lat: String(input.lat),
          lng: String(input.lng),
          description: input.description,
          address: input.address,
          category: input.category,
          language: input.language,
          ...liveFields(input.photo),
        },
      },
    }),

  /** Confirm the fix (closes the complaint) or reopen it; reopen needs a comment (docs/API.md §5.4). */
  feedback: (id: number, body: { action: 'confirm' | 'reopen'; rating?: number; comment?: string }) =>
    post<Complaint>(`/citizen/complaints/${id}/feedback`, body),
}

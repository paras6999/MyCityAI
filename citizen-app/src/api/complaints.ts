import { get, request } from './client'
import type {
  AnalyzeResult, Complaint, HomeSummary, Page, PickedPhoto, Status, SubmitInput, TimelineEvent,
} from './types'

export const complaintsApi = {
  home: () => get<HomeSummary>('/citizen/home'),

  list: (params: { status?: Status; page?: number; page_size?: number } = {}) =>
    get<Page<Complaint>>('/citizen/complaints', params),

  detail: (id: number) => get<Complaint>(`/citizen/complaints/${id}`),

  timeline: (id: number) => get<{ items: TimelineEvent[] }>(`/citizen/complaints/${id}/timeline`),

  /** AI pre-check: category, priority and nearby duplicates. Saves nothing (docs/API.md §5.1). */
  analyze: (input: { photo: PickedPhoto; lat: number; lng: number; description?: string }) =>
    request<AnalyzeResult>('POST', '/citizen/complaints/analyze', {
      multipart: {
        file: { field: 'photo', photo: input.photo },
        fields: { lat: String(input.lat), lng: String(input.lng), description: input.description },
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
        },
      },
    }),
}

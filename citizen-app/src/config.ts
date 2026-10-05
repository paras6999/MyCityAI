export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '')
export const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === 'true'
// Photos are served by the backend at /media, next to /api/v1.
export const MEDIA_ORIGIN = API_URL.replace(/\/api\/v1$/, '')

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { SESSION_EXPIRED_EVENT, tokenStorage } from '../auth/tokenStorage'
import type { ApiErrorBody, TokenResponse } from './types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export const api = axios.create({ baseURL: API_URL, timeout: 15000 })

/** Error thrown by every API call, built from the API.md error format. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  const body = error.response?.data?.error
  if (error.response && body) {
    return new ApiError(error.response.status, body.code, body.message, body.details)
  }
  if (error.response) {
    return new ApiError(error.response.status, 'HTTP_ERROR', error.message)
  }
  return new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server')
}

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// One shared refresh call, so several requests failing at once trigger a single refresh.
let refreshing: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefresh()
  if (!refreshToken) throw new Error('No refresh token')
  // Plain axios (not `api`) so this request skips the interceptors below.
  const { data } = await axios.post<TokenResponse>(`${API_URL}/auth/refresh`, {
    refresh_token: refreshToken,
  })
  tokenStorage.save(data.access_token, data.refresh_token)
  return data.access_token
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const expired = error.response?.data?.error?.code === 'TOKEN_EXPIRED'

    if (expired && original && !original._retried) {
      original._retried = true
      try {
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null
        })
        const token = await refreshing
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        tokenStorage.clear()
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
    }
    return Promise.reject(toApiError(error))
  },
)

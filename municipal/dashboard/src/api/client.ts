import axios, { AxiosError } from 'axios'

import type { ApiErrorBody } from './types'

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

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const body = error.response?.data?.error
    if (error.response && body) {
      return Promise.reject(new ApiError(error.response.status, body.code, body.message, body.details))
    }
    if (error.response) {
      return Promise.reject(new ApiError(error.response.status, 'HTTP_ERROR', error.message))
    }
    return Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'))
  },
)

import { Platform } from 'react-native'
import { API_URL, MEDIA_ORIGIN, USE_MOCKS } from '../config'
import { storage } from '../lib/storage'
import type { PickedPhoto, TokenResponse } from './types'
import { mockRequest } from './mocks'

const ACCESS_KEY = 'mycityai.access_token'
const REFRESH_KEY = 'mycityai.refresh_token'
const REQUEST_TIMEOUT_MS = 30_000
const GET_RETRIES = 2

/** Error format of docs/API.md §1: { error: { code, message, details } } */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
  get isNetwork() {
    return this.code === 'NETWORK_ERROR'
  }
}

export interface MultipartBody {
  fields: Record<string, string | undefined>
  file?: { field: string; photo: PickedPhoto }
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>
  json?: unknown
  multipart?: MultipartBody
  auth?: boolean
}

// --- Token handling -------------------------------------------------------------------------

let accessToken: string | null = null
let refreshToken: string | null = null
let onSessionExpired: (() => void) | null = null

export const tokens = {
  async load() {
    accessToken = await storage.get(ACCESS_KEY)
    refreshToken = await storage.get(REFRESH_KEY)
    return Boolean(accessToken && refreshToken)
  },
  async save(access: string, refresh: string) {
    accessToken = access
    refreshToken = refresh
    await storage.set(ACCESS_KEY, access)
    await storage.set(REFRESH_KEY, refresh)
  },
  async clear() {
    accessToken = null
    refreshToken = null
    await storage.remove(ACCESS_KEY)
    await storage.remove(REFRESH_KEY)
  },
  setSessionExpiredHandler(handler: (() => void) | null) {
    onSessionExpired = handler
  },
}

let refreshInFlight: Promise<boolean> | null = null

/** One refresh at a time: parallel 401s share the same refresh call. */
function refreshSession(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false)
  refreshInFlight ??= (async () => {
    try {
      const data = await rawRequest<TokenResponse>('POST', '/auth/refresh', {
        json: { refresh_token: refreshToken },
        auth: false,
      })
      await tokens.save(data.access_token, data.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// --- Transport ------------------------------------------------------------------------------

async function toFormData(body: MultipartBody): Promise<FormData> {
  const form = new FormData()
  for (const [key, value] of Object.entries(body.fields)) {
    if (value !== undefined && value !== '') form.append(key, value)
  }
  if (body.file) {
    const { field, photo } = body.file
    if (Platform.OS === 'web') {
      const blob = await (await fetch(photo.uri)).blob()
      form.append(field, new File([blob], photo.fileName, { type: photo.mimeType }))
    } else {
      // React Native accepts a { uri, name, type } descriptor in place of a Blob.
      form.append(field, { uri: photo.uri, name: photo.fileName, type: photo.mimeType } as unknown as Blob)
    }
  }
  return form
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function rawRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let body: BodyInit | undefined
  if (options.multipart) body = await toFormData(options.multipart)
  else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), { method, headers, body, signal: controller.signal })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const err = payload?.error
    throw new ApiError(response.status, err?.code ?? 'HTTP_ERROR', err?.message ?? 'Request failed', err?.details)
  }
  return payload as T
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The single entry point used by the endpoint modules. UI components never call fetch. */
export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  if (USE_MOCKS) return mockRequest<T>(method, path, options)

  const attempts = method === 'GET' ? GET_RETRIES + 1 : 1
  for (let attempt = 1; ; attempt++) {
    try {
      return await rawRequest<T>(method, path, options)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error

      if (error.status === 401 && options.auth !== false) {
        if (refreshToken && (await refreshSession())) return rawRequest<T>(method, path, options)
        await tokens.clear()
        onSessionExpired?.()
      }
      if (error.isNetwork && attempt < attempts) {
        await sleep(400 * attempt)
        continue
      }
      throw error
    }
  }
}

export const get = <T>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query })
export const post = <T>(path: string, json?: unknown) => request<T>('POST', path, { json })
export const patch = <T>(path: string, json: unknown) => request<T>('PATCH', path, { json })

/** Photos live at /media next to /api/v1; the API returns paths like "/media/complaints/1/photo.jpg". */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^(https?:|data:|blob:|file:)/.test(path)) return path
  return `${MEDIA_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

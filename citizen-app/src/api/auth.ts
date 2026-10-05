import { get, patch, post, request } from './client'
import type { Language, OtpTokenResponse, User, Ward } from './types'

export const authApi = {
  requestOtp: (phone: string) =>
    request<{ sent: boolean; expires_in: number }>('POST', '/auth/otp/request', { json: { phone }, auth: false }),
  verifyOtp: (phone: string, otp: string) =>
    request<OtpTokenResponse>('POST', '/auth/otp/verify', { json: { phone, otp }, auth: false }),
  wards: () => request<{ items: Ward[] }>('GET', '/wards', { auth: false }),
  registerDevice: (token: string, platform: 'android' | 'ios') =>
    post<void>('/auth/device-token', { token, platform }),
  unregisterDevice: (token: string, platform: 'android' | 'ios') =>
    request<void>('DELETE', '/auth/device-token', { json: { token, platform } }),
  me: () => get<User>('/auth/me'),
  updateMe: (changes: { name?: string; language?: Language; ward_id?: number | null }) =>
    patch<User>('/auth/me', changes),
}

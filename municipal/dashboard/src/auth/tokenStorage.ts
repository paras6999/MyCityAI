// Tokens live in localStorage so a page reload keeps the user signed in.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.

const ACCESS_KEY = 'mycityai.access_token'
const REFRESH_KEY = 'mycityai.refresh_token'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Ignore: the session simply won't survive a reload.
  }
}

export const tokenStorage = {
  getAccess: () => read(ACCESS_KEY),
  getRefresh: () => read(REFRESH_KEY),
  save(access: string, refresh: string) {
    write(ACCESS_KEY, access)
    write(REFRESH_KEY, refresh)
  },
  clear() {
    write(ACCESS_KEY, null)
    write(REFRESH_KEY, null)
  },
}

/** Fired when the session can no longer be refreshed; AuthProvider listens and signs out. */
export const SESSION_EXPIRED_EVENT = 'mycityai:session-expired'

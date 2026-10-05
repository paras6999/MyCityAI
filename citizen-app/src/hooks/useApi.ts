import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

export interface QueryState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  reload: () => Promise<void>
}

/** Loads data on mount (and when `deps` change). Screens render skeleton / error / empty from this. */
export function useQuery<T>(load: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const latest = useRef(0)

  const run = useCallback(async () => {
    const id = ++latest.current
    setLoading(true)
    setError(null)
    try {
      const result = await load()
      if (id === latest.current) setData(result)
    } catch (e) {
      if (id === latest.current) setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Unexpected error'))
    } finally {
      if (id === latest.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void run()
  }, [run])

  return { data, loading, error, reload: run }
}

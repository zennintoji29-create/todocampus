import { useCallback, useEffect, useRef, useState } from 'react'
import { API_ERROR } from '@/lib/api'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: (updater: T | ((prev: T | null) => T | null)) => void
}

/**
 * Small data hook: runs `loader` on mount / when deps change, tracks loading
 * and error state, and ignores results from stale runs.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const runId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++runId.current
    setLoading(true)
    setError(null)
    try {
      const result = await loader()
      if (id === runId.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      if (id === runId.current) {
        setError(API_ERROR(e))
      }
    } finally {
      if (id === runId.current) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    data,
    loading,
    error,
    reload,
    setData: (updater) => setData((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater)),
  }
}

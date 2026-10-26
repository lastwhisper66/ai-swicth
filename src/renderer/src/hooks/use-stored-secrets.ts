import { useEffect, useState } from 'react'
import type { ApiResult } from '@shared/ipc'

export function useStoredSecrets<T>(
  read: () => Promise<ApiResult<T>>,
  enabled: boolean,
  failureMessage: string
): {
  value: T | null
  loading: boolean
  error: string | null
  reload: () => void
  adopt: (value: T) => void
} {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    value: T | null
    loading: boolean
    error: string | null
  }>({ value: null, loading: enabled, error: null })

  useEffect(() => {
    if (!enabled) return
    let active = true
    void Promise.resolve()
      .then(read)
      .then((result) => {
        if (!active) return
        setState((current) =>
          result.ok
            ? { value: result.value, loading: false, error: null }
            : { ...current, loading: false, error: result.error.message }
        )
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, loading: false, error: failureMessage }))
      })
    return () => {
      active = false
    }
  }, [read, enabled, failureMessage, attempt])

  function reload(): void {
    setState((current) => ({ ...current, loading: true, error: null }))
    setAttempt((current) => current + 1)
  }

  function adopt(value: T): void {
    setState({ value, loading: false, error: null })
  }

  return { ...state, reload, adopt }
}

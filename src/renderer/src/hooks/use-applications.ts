import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ApplicationTask, ManagedApplication } from '@shared/ipc'
import type { ApplicationId } from '@shared/applications'

export interface ApplicationListState {
  applications: ManagedApplication[] | null
  refreshing: boolean
  error: string | null
  readyForActions: boolean
  refresh: (feedback?: boolean, invalidate?: boolean) => Promise<void>
}

/** Each page visit starts a fresh detection; dynamic fields stay blank until confirmed. */
export function useApplications(tasks: ApplicationTask[]): ApplicationListState {
  const [mutationRevision, setMutationRevision] = useState(0)
  const [state, setState] = useState<{
    applications: ManagedApplication[] | null
    refreshing: boolean
    error: string | null
    confirmedTasks: number | null
  }>({ applications: null, refreshing: true, error: null, confirmedTasks: null })
  const pending = useRef<Promise<void> | null>(null)
  const revision = useRef(0)
  const feedbackRequested = useRef(false)
  const mounted = useRef(false)
  const completion = useRef(mutationRevision)
  const handledTasks = useRef(
    new Set(tasks.filter((task) => task.state !== 'running').map((task) => task.id))
  )
  const checkRevision = useRef(0)
  const checkResults = useRef(new Map<ApplicationId, { revision: number; task: ApplicationTask }>())

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback((feedback = false, invalidate = false): Promise<void> => {
    feedbackRequested.current ||= feedback
    if (invalidate) revision.current += 1
    if (pending.current) return pending.current
    setState((current) => ({ ...current, applications: null, refreshing: true, error: null }))

    const request = async (): Promise<void> => {
      let requestedRevision: number
      do {
        requestedRevision = revision.current
        const confirmedTasks = completion.current
        const initialCheckRevision = checkRevision.current
        try {
          const response = await window.api.getApplications()
          if (!mounted.current) return
          if (requestedRevision !== revision.current) continue
          if (!response.ok) {
            setState((current) => ({ ...current, error: response.error.message }))
            if (feedbackRequested.current) toast.error(response.error.message)
          } else {
            const applications = response.value.map((application) => {
              const check = checkResults.current.get(application.applicationId)
              return check && check.revision > initialCheckRevision
                ? applyVersionCheck(application, check.task)
                : application
            })
            setState((current) => ({
              ...current,
              applications,
              error: null,
              confirmedTasks
            }))
            if (feedbackRequested.current) {
              const problems = applications.filter(
                (application) =>
                  application.environmentError ||
                  application.installation.state === 'unavailable' ||
                  !application.npm.available ||
                  application.latestVersionError
              )
              if (problems.length)
                toast.warning(`检测完成，${problems.length} 个应用需要检查。请点击行内详情查看。`, {
                  duration: 8000
                })
              else toast.success('AI 应用状态已更新。')
            }
          }
          feedbackRequested.current = false
        } catch {
          if (!mounted.current) return
          if (requestedRevision !== revision.current) continue
          const message = '无法读取 AI 应用，请重新检测或重新打开应用后重试。'
          setState((current) => ({ ...current, error: message }))
          if (feedbackRequested.current) toast.error(message)
          feedbackRequested.current = false
        }
        // A task or shell change during detection requires a fresh result.
      } while (mounted.current && requestedRevision !== revision.current)
    }
    pending.current = request().finally(() => {
      pending.current = null
      if (mounted.current) setState((current) => ({ ...current, refreshing: false }))
    })
    return pending.current
  }, [])

  useEffect(() => {
    const taskChanged = completion.current !== mutationRevision
    completion.current = mutationRevision
    void refresh(false, taskChanged)
  }, [mutationRevision, refresh])

  useEffect(() => {
    const finished = tasks.filter(
      (task) => task.state !== 'running' && !handledTasks.current.has(task.id)
    )
    if (!finished.length) return
    for (const task of finished) handledTasks.current.add(task.id)
    // Removing old entries from the bounded task list must not trigger detection.
    if (finished.some((task) => task.action !== 'check-update'))
      setMutationRevision((current) => current + 1)
    const checks = finished.filter((task) => task.action === 'check-update')
    if (!checks.length) return
    if (checks.some((task) => task.state === 'succeeded' && !task.result))
      toast.warning('检查已完成，但当前后台未返回详细结果。请完整退出并重新打开应用后重试。', {
        duration: 10000
      })
    const updates = new Map(checks.map((task) => [task.applicationId, task]))
    for (const task of checks) {
      checkResults.current.set(task.applicationId, { revision: ++checkRevision.current, task })
    }
    setState((current) => ({
      ...current,
      applications:
        current.applications?.map((application) => {
          const task = updates.get(application.applicationId)
          return task ? applyVersionCheck(application, task) : application
        }) ?? null
    }))
  }, [tasks])

  return {
    applications: state.applications,
    refreshing: state.refreshing,
    error: state.error,
    readyForActions:
      !!state.applications &&
      !state.refreshing &&
      !state.error &&
      state.confirmedTasks === mutationRevision,
    refresh
  }
}

function applyVersionCheck(
  application: ManagedApplication,
  task: ApplicationTask
): ManagedApplication {
  if (task.state === 'succeeded' && task.result?.applicationId === application.applicationId)
    return task.result
  // An older main process can finish successfully without the newer result field.
  // Preserve the confirmed row instead of reporting a registry request failure.
  if (task.state === 'succeeded') return application
  return {
    ...application,
    latestVersion: null,
    latestVersionError: task.state === 'failed' ? task.message : '检查结果不可用，请重新检测。',
    updateAvailable: false
  }
}

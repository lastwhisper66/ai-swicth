import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ApplicationTask, ManagedApplication } from '@shared/ipc'
import { APPLICATION_IDS, type ApplicationId } from '@shared/applications'

export interface ApplicationListState {
  applications: ManagedApplication[]
  refreshing: boolean
  error: string | null
  refresh: (feedback?: boolean, invalidate?: boolean) => Promise<void>
}

interface DetectionRequest {
  id: string
  feedback: boolean
  promise: Promise<void>
  unsubscribe: () => void
}

/** Each page visit starts a fresh detection; dynamic fields stay blank until confirmed. */
export function useApplications(tasks: ApplicationTask[]): ApplicationListState {
  const [state, setState] = useState<{
    applications: ManagedApplication[]
    refreshing: boolean
    error: string | null
  }>({ applications: [], refreshing: true, error: null })
  const pending = useRef<DetectionRequest | null>(null)
  const mounted = useRef(false)
  const handledTasks = useRef(
    new Set(tasks.filter((task) => task.state !== 'running').map((task) => task.id))
  )
  const resultRevision = useRef(0)
  const taskResults = useRef(new Map<ApplicationId, { revision: number; task: ApplicationTask }>())

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.unsubscribe()
      pending.current = null
    }
  }, [])

  const refresh = useCallback((feedback = false, invalidate = false): Promise<void> => {
    if (pending.current && !invalidate) {
      pending.current.feedback ||= feedback
      return pending.current.promise
    }
    const request: DetectionRequest = {
      id: crypto.randomUUID(),
      feedback: feedback || (pending.current?.feedback ?? false),
      promise: Promise.resolve(),
      unsubscribe: () => {}
    }
    pending.current?.unsubscribe()
    pending.current = request
    setState({ applications: [], refreshing: true, error: null })
    const initialResultRevision = resultRevision.current
    const isCurrent = (): boolean => mounted.current && pending.current === request
    const mergeTaskResult = (application: ManagedApplication): ManagedApplication => {
      const result = taskResults.current.get(application.applicationId)
      return result && result.revision > initialResultRevision
        ? applyTaskResult(application, result.task)
        : application
    }

    request.promise = (async (): Promise<void> => {
      try {
        // Skip requests invalidated before dispatch, including the StrictMode effect replay.
        await Promise.resolve()
        if (!isCurrent()) return
        request.unsubscribe = window.api.onApplicationDetected((result) => {
          if (!isCurrent() || result.requestId !== request.id) return
          const application = mergeTaskResult(result.application)
          setState((current) => ({
            ...current,
            applications: replaceApplication(current.applications, application)
          }))
        })
        const response = await window.api.getApplications({ requestId: request.id })
        if (!isCurrent()) return
        if (!response.ok) {
          setState((current) => ({ ...current, error: response.error.message }))
          if (request.feedback) toast.error(response.error.message)
          return
        }
        // Reconcile the final response without replacing newer installation task results.
        const applications = response.value.map(mergeTaskResult)
        setState((current) => ({ ...current, applications, error: null }))
        if (request.feedback) {
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
      } catch {
        if (!isCurrent()) return
        const message = '无法读取 AI 应用，请完整退出并重新打开应用后重试。'
        setState((current) => ({ ...current, error: message }))
        if (request.feedback) toast.error(message)
      } finally {
        request.unsubscribe()
        if (isCurrent()) {
          pending.current = null
          setState((current) => ({ ...current, refreshing: false }))
        }
      }
    })()
    return request.promise
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const finished = tasks.filter(
      (task) => task.state !== 'running' && !handledTasks.current.has(task.id)
    )
    if (!finished.length) return
    for (const task of finished) handledTasks.current.add(task.id)
    if (finished.some((task) => task.state === 'succeeded' && !task.result))
      toast.warning('操作已完成，但当前后台未返回详细结果。请完整退出并重新打开应用后重试。', {
        duration: 10000
      })
    for (const task of finished) {
      taskResults.current.set(task.applicationId, { revision: ++resultRevision.current, task })
    }
    setState((current) => ({
      ...current,
      applications: finished.reduce((applications, task) => {
        const previous = applications.find((item) => item.applicationId === task.applicationId)
        const result = previous
          ? applyTaskResult(previous, task)
          : task.result?.applicationId === task.applicationId
            ? task.result
            : null
        return result ? replaceApplication(applications, result) : applications
      }, current.applications)
    }))
  }, [tasks])

  return {
    applications: state.applications,
    refreshing: state.refreshing,
    error: state.error,
    refresh
  }
}

function replaceApplication(
  applications: ManagedApplication[],
  application: ManagedApplication
): ManagedApplication[] {
  const entries = new Map(applications.map((item) => [item.applicationId, item]))
  entries.set(application.applicationId, application)
  return APPLICATION_IDS.flatMap((id) => entries.get(id) ?? [])
}

function applyTaskResult(
  application: ManagedApplication,
  task: ApplicationTask
): ManagedApplication {
  if (task.result?.applicationId === application.applicationId) return task.result
  if (task.action !== 'check-update') {
    const message = '安装结果尚未确认，请完整退出并重新打开应用后重新检测。'
    return {
      ...application,
      installation: {
        state: 'unavailable',
        version: null,
        executablePath: null,
        message
      },
      npm: { ...application.npm, managed: false, message },
      updateAvailable: false
    }
  }
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

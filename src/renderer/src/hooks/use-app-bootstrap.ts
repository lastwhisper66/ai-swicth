import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  TOOL_IDS,
  type AppBootstrap,
  type AppSnapshot,
  type ToolId,
  type ToolInstallation,
  type ToolStatus
} from '@shared/ipc'

type AppViewData = AppBootstrap & { tools: Partial<Record<ToolId, ToolStatus>> }

interface AppBootstrapState {
  snapshot: AppViewData | null
  setSnapshot: Dispatch<SetStateAction<AppViewData | null>>
  connectionError: string | null
  toolErrors: Partial<Record<ToolId, string>>
  initialize: () => Promise<AppBootstrap | null>
  loadTool: (toolId: ToolId) => Promise<void>
  replaceSnapshot: (next: AppSnapshot) => void
  updateInstallation: (toolId: ToolId, installation: ToolInstallation) => void
}

/** Local data and each tool's status load independently; incomplete status stays undefined. */
export function useAppBootstrap(): AppBootstrapState {
  const [snapshot, setSnapshot] = useState<AppViewData | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [toolErrors, setToolErrors] = useState<Partial<Record<ToolId, string>>>({})
  const mounted = useRef(false)
  const bootstrapRevision = useRef(0)
  const requests = useRef(new Map<ToolId, symbol>())
  const installationRevision = useRef(0)
  const installations = useRef(
    new Map<ToolId, { revision: number; installation: ToolInstallation }>()
  )

  useEffect(() => {
    mounted.current = true
    const activeRequests = requests.current
    return () => {
      mounted.current = false
      bootstrapRevision.current += 1
      activeRequests.clear()
    }
  }, [])

  const loadTool = useCallback(async (toolId: ToolId): Promise<void> => {
    const request = Symbol(toolId)
    requests.current.set(toolId, request)
    const initialInstallationRevision = installationRevision.current
    const isCurrent = (): boolean => mounted.current && requests.current.get(toolId) === request
    setToolErrors((current) => ({ ...current, [toolId]: undefined }))
    setSnapshot((current) => {
      if (!current) return current
      const tools = { ...current.tools }
      delete tools[toolId]
      return { ...current, tools }
    })
    try {
      const response = await window.api.getToolStatus({ toolId })
      if (!isCurrent()) return
      if (!response.ok) {
        setToolErrors((current) => ({ ...current, [toolId]: response.error.message }))
        return
      }
      const update = installations.current.get(toolId)
      const status =
        update && update.revision > initialInstallationRevision
          ? { ...response.value, installation: update.installation }
          : response.value
      setSnapshot((current) =>
        current ? { ...current, tools: { ...current.tools, [toolId]: status } } : current
      )
    } catch {
      if (isCurrent())
        setToolErrors((current) => ({
          ...current,
          [toolId]: '无法确认工具状态，请重试或完整重启应用。'
        }))
    } finally {
      if (isCurrent()) requests.current.delete(toolId)
    }
  }, [])

  const initialize = useCallback(async (): Promise<AppBootstrap | null> => {
    const revision = ++bootstrapRevision.current
    requests.current.clear()
    setConnectionError(null)
    await Promise.resolve()
    if (!mounted.current || revision !== bootstrapRevision.current) return null
    try {
      if (!window.api) throw new Error('本地桥接未加载，请完整退出并重新打开应用。')
      const response = await window.api.getBootstrap()
      if (!mounted.current || revision !== bootstrapRevision.current) return null
      if (!response.ok) {
        setConnectionError(response.error.message)
        return null
      }
      setSnapshot({ ...response.value, tools: {} })
      setToolErrors({})
      for (const toolId of TOOL_IDS) void loadTool(toolId)
      return response.value
    } catch (error) {
      if (mounted.current && revision === bootstrapRevision.current)
        setConnectionError(error instanceof Error ? error.message : '无法读取本地配置，请重试。')
      return null
    }
  }, [loadTool])

  const replaceSnapshot = useCallback((next: AppSnapshot): void => {
    bootstrapRevision.current += 1
    requests.current.clear()
    setToolErrors({})
    setSnapshot(next)
    setConnectionError(null)
  }, [])

  const updateInstallation = useCallback((toolId: ToolId, installation: ToolInstallation): void => {
    installations.current.set(toolId, { revision: ++installationRevision.current, installation })
    setSnapshot((current) => {
      const status = current?.tools[toolId]
      return current && status
        ? { ...current, tools: { ...current.tools, [toolId]: { ...status, installation } } }
        : current
    })
  }, [])

  return {
    snapshot,
    setSnapshot,
    connectionError,
    toolErrors,
    initialize,
    loadTool,
    replaceSnapshot,
    updateInstallation
  }
}

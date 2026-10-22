import { startTransition, useEffect, useState } from 'react'
import { AlertCircle, ArrowLeftRight, CheckCircle2, LoaderCircle, RefreshCw, X } from 'lucide-react'
import type { ApiResult, AppSnapshot, ProviderSummary, ToolId } from '@shared/ipc'
import { ProviderDialog } from '@renderer/components/features/ProviderDialog'
import { ProvidersPage } from '@renderer/components/features/ProvidersPage'
import { SettingsBackups } from '@renderer/components/features/SettingsBackups'
import { ToolSwitchPanel } from '@renderer/components/features/ToolSwitchPanel'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { TooltipProvider } from '@renderer/components/ui/tooltip'

interface Feedback {
  tone: 'success' | 'warning' | 'error'
  message: string
}

type ProviderDialogState = { provider: ProviderSummary | null } | null

const emptySelection: Record<ToolId, string> = {
  'claude-code': '',
  codex: ''
}

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [selectedProviders, setSelectedProviders] = useState<Record<ToolId, string>>(emptySelection)
  const [providerDialog, setProviderDialog] = useState<ProviderDialogState>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(() =>
    window.api ? null : '本地桥接未加载，请关闭并重新打开应用。'
  )

  useEffect(() => {
    let active = true
    const api = window.api
    if (!api) {
      return () => {
        active = false
      }
    }

    api
      .getSnapshot()
      .then((result) => {
        if (!active) return
        if (result.ok) {
          startTransition(() => {
            setSnapshot(result.value)
            setSelectedProviders({
              'claude-code': chooseProvider(result.value, 'claude-code', ''),
              codex: chooseProvider(result.value, 'codex', '')
            })
          })
        } else {
          setConnectionError(result.error.message)
        }
      })
      .catch(() => {
        if (active) setConnectionError('无法连接本地应用，请关闭并重新打开应用。')
      })
    return () => {
      active = false
    }
  }, [])

  function adoptSnapshot(nextSnapshot: AppSnapshot): void {
    startTransition(() => {
      setSnapshot(nextSnapshot)
      setSelectedProviders((current) => ({
        'claude-code': chooseProvider(nextSnapshot, 'claude-code', current['claude-code']),
        codex: chooseProvider(nextSnapshot, 'codex', current.codex)
      }))
      setConnectionError(null)
    })
  }

  async function retryConnection(): Promise<void> {
    setConnectionError(null)
    if (!window.api) {
      setConnectionError('本地桥接未加载，请关闭并重新打开应用。')
      return
    }
    try {
      const result = await window.api.getSnapshot()
      if (result.ok) adoptSnapshot(result.value)
      else setConnectionError(result.error.message)
    } catch {
      setConnectionError('无法连接本地应用，请关闭并重新打开应用。')
    }
  }

  async function refreshSnapshot(): Promise<void> {
    setPendingKey('refresh')
    setFeedback(null)
    try {
      const result = await window.api.getSnapshot()
      if (!result.ok) return showError(result.error.message)
      adoptSnapshot(result.value)
      showSuccess('工具状态已刷新。')
    } catch {
      showError('无法刷新本地状态，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function deleteProvider(providerId: string): Promise<void> {
    await runSnapshotOperation(
      `delete:${providerId}`,
      () => window.api.deleteProvider({ id: providerId }),
      '供应商已删除。'
    )
  }

  async function applyProvider(toolId: ToolId, providerId: string): Promise<void> {
    const key = `apply:${toolId}`
    setPendingKey(key)
    setFeedback(null)
    try {
      const result = await window.api.applyProvider({ toolId, providerId })
      if (!result.ok) return showError(result.error.message)
      adoptSnapshot(result.value.snapshot)
      const warnings = result.value.operation.warnings
      const message =
        warnings.length > 0
          ? `${result.value.operation.message} ${warnings.join(' ')}`
          : result.value.operation.message
      if (warnings.length > 0) showWarning(message)
      else showSuccess(message)
    } catch {
      showError('无法连接本地应用，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function savePath(toolId: ToolId, path: string): Promise<void> {
    await runSnapshotOperation(
      `path:${toolId}:save`,
      () => window.api.setToolPath({ toolId, path }),
      '配置路径已更新。'
    )
  }

  async function pickPath(toolId: ToolId): Promise<void> {
    const key = `path:${toolId}:pick`
    setPendingKey(key)
    setFeedback(null)
    try {
      const picked = await window.api.pickToolPath({ toolId })
      if (!picked.ok) return showError(picked.error.message)
      if (!picked.value) return
      const saved = await window.api.setToolPath({ toolId, path: picked.value })
      if (!saved.ok) return showError(saved.error.message)
      adoptSnapshot(saved.value)
      showSuccess('配置路径已更新。')
    } catch {
      showError('无法打开文件选择器，请重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function resetPath(toolId: ToolId): Promise<void> {
    await runSnapshotOperation(
      `path:${toolId}:reset`,
      () => window.api.resetToolPath({ toolId }),
      '已移除自定义配置路径。'
    )
  }

  async function restoreBackup(backupId: string): Promise<void> {
    const key = `restore:${backupId}`
    setPendingKey(key)
    setFeedback(null)
    try {
      const result = await window.api.restoreBackup({ backupId })
      if (!result.ok) return showError(result.error.message)
      adoptSnapshot(result.value.snapshot)
      showSuccess(result.value.operation.message)
    } catch {
      showError('无法连接本地应用，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function runSnapshotOperation(
    key: string,
    operation: () => Promise<ApiResult<AppSnapshot>>,
    successMessage: string
  ): Promise<void> {
    setPendingKey(key)
    setFeedback(null)
    try {
      const result = await operation()
      if (!result.ok) return showError(result.error.message)
      adoptSnapshot(result.value)
      showSuccess(successMessage)
    } catch {
      showError('无法连接本地应用，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  function showSuccess(message: string): void {
    setFeedback({ tone: 'success', message })
  }

  function showError(message: string): void {
    setFeedback({ tone: 'error', message })
  }

  function showWarning(message: string): void {
    setFeedback({ tone: 'warning', message })
  }

  if (!snapshot) {
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
          {connectionError ? (
            <AlertCircle className="mx-auto size-6 text-destructive" aria-hidden="true" />
          ) : (
            <LoaderCircle className="mx-auto size-6 animate-spin" aria-hidden="true" />
          )}
          <p className="mt-3 text-sm">{connectionError ?? '正在读取本地配置…'}</p>
          {connectionError && (
            <Button className="mt-4" variant="outline" onClick={() => void retryConnection()}>
              <RefreshCw aria-hidden="true" />
              重试
            </Button>
          )}
        </div>
      </main>
    )
  }

  return (
    <TooltipProvider>
      <div className="min-h-svh">
        <header className="border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ArrowLeftRight className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold">AI Switch</h1>
              <p className="text-xs text-muted-foreground">本地供应商配置</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              disabled={pendingKey !== null}
              onClick={() => void refreshSnapshot()}
              aria-label="刷新工具状态"
              title="刷新工具状态"
            >
              <RefreshCw
                className={pendingKey === 'refresh' ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
            </Button>
            <Badge variant="outline" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />v
              {snapshot.appInfo.version}
            </Badge>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
          {feedback && <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />}

          <Tabs defaultValue="switch" className="gap-6">
            <TabsList variant="line" className="w-full justify-start border-b pb-2">
              <TabsTrigger value="switch">工具切换</TabsTrigger>
              <TabsTrigger value="providers">供应商</TabsTrigger>
              <TabsTrigger value="settings">设置与备份</TabsTrigger>
            </TabsList>

            <TabsContent value="switch">
              <div className="mb-5">
                <h2 className="text-base font-semibold">当前工具配置</h2>
                <p className="mt-1 text-sm text-muted-foreground">两个工具的配置和备份彼此独立。</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {(['claude-code', 'codex'] as const).map((toolId) => (
                  <ToolSwitchPanel
                    busy={pendingKey !== null}
                    key={toolId}
                    toolId={toolId}
                    status={snapshot.tools[toolId]}
                    providers={snapshot.providers}
                    selectedProviderId={selectedProviders[toolId]}
                    pending={pendingKey === `apply:${toolId}`}
                    onSelectedProviderChange={(providerId) =>
                      setSelectedProviders((current) => ({ ...current, [toolId]: providerId }))
                    }
                    onApply={(selectedToolId, providerId) =>
                      void applyProvider(selectedToolId, providerId)
                    }
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="providers">
              <ProvidersPage
                busy={pendingKey !== null}
                providers={snapshot.providers}
                onAdd={() => setProviderDialog({ provider: null })}
                onEdit={(provider) => setProviderDialog({ provider })}
                onDelete={(providerId) => void deleteProvider(providerId)}
              />
            </TabsContent>

            <TabsContent value="settings">
              <SettingsBackups
                busy={pendingKey !== null}
                tools={snapshot.tools}
                backups={snapshot.backups}
                pendingKey={pendingKey}
                onSavePath={(toolId, path) => void savePath(toolId, path)}
                onPickPath={(toolId) => void pickPath(toolId)}
                onResetPath={(toolId) => void resetPath(toolId)}
                onRestore={(backupId) => void restoreBackup(backupId)}
              />
            </TabsContent>
          </Tabs>
        </main>

        {providerDialog && (
          <ProviderDialog
            key={providerDialog.provider?.id ?? 'new'}
            open
            provider={providerDialog.provider}
            onOpenChange={(open) => !open && setProviderDialog(null)}
            onSaved={(nextSnapshot, message) => {
              adoptSnapshot(nextSnapshot)
              showSuccess(message)
            }}
            onFailure={showError}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

function FeedbackBanner({
  feedback,
  onClose
}: {
  feedback: Feedback
  onClose: () => void
}): React.JSX.Element {
  const success = feedback.tone === 'success'
  const warning = feedback.tone === 'warning'
  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : warning
            ? 'border-amber-200 bg-amber-50 text-amber-950'
            : 'border-red-200 bg-red-50 text-red-900'
      }`}
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 leading-5">{feedback.message}</span>
      <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="关闭提示">
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

function chooseProvider(snapshot: AppSnapshot, toolId: ToolId, current: string): string {
  const compatibleProviders = snapshot.providers.filter((provider) =>
    provider.tools.includes(toolId)
  )
  if (compatibleProviders.some((provider) => provider.id === current)) return current
  const activeProviderId = snapshot.tools[toolId].currentProviderId
  if (
    activeProviderId &&
    compatibleProviders.some((provider) => provider.id === activeProviderId)
  ) {
    return activeProviderId
  }
  return compatibleProviders[0]?.id ?? ''
}

export default App

import { startTransition, useEffect, useState } from 'react'
import { AlertCircle, ArrowLeftRight, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ApiResult,
  AppSnapshot,
  OpenToolLocationInput,
  ProviderSummary,
  ToolId
} from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { ProviderForm } from '@renderer/components/features/ProviderForm'
import { SettingsPage, type SettingsSection } from '@renderer/components/features/SettingsPage'
import { ToolConfigPage } from '@renderer/components/features/ToolConfigPage'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Spinner } from '@renderer/components/ui/spinner'
import { TooltipProvider } from '@renderer/components/ui/tooltip'

type ProviderEditorState = { provider: ProviderSummary | null; toolId: ToolId } | null
type MainView = ToolId | 'settings'

const feedbackToastId = 'app-feedback'

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [providerEditor, setProviderEditor] = useState<ProviderEditorState>(null)
  const [settingsTool, setSettingsTool] = useState<ToolId>('claude-code')
  const [view, setView] = useState<MainView>('claude-code')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('providers')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
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
    const key = `apply:${toolId}:${providerId}`
    setPendingKey(key)
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
    try {
      const picked = await window.api.pickToolPath({ toolId })
      if (!picked.ok) return showError(picked.error.message)
      if (!picked.value) return
      const saved = await window.api.setToolPath({ toolId, path: picked.value })
      if (!saved.ok) return showError(saved.error.message)
      adoptSnapshot(saved.value)
      showSuccess('配置路径已更新。')
    } catch {
      showError('无法打开目录选择器，请重试。')
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

  async function openToolLocation(input: OpenToolLocationInput): Promise<void> {
    setPendingKey(`path:${input.toolId}:open:${input.target}`)
    try {
      const result = await window.api.openToolLocation(input)
      if (!result.ok) showError(result.error.message)
    } catch {
      showError('无法打开配置位置，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function restoreBackup(backupId: string): Promise<void> {
    const key = `restore:${backupId}`
    setPendingKey(key)
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
    toast.success(message, { id: feedbackToastId, duration: 4000 })
  }

  function showError(message: string): void {
    toast.error(message, { id: feedbackToastId, duration: 8000 })
  }

  function showWarning(message: string): void {
    toast.warning(message, { id: feedbackToastId, duration: 8000 })
  }

  function openProviderEditor(toolId: ToolId, provider: ProviderSummary | null = null): void {
    setView('settings')
    setSettingsSection('providers')
    setSettingsTool(toolId)
    setProviderEditor({ provider, toolId })
  }

  if (!snapshot) {
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <Card className="w-full max-w-sm py-0 text-center">
          <CardContent className="p-6">
            {connectionError ? (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{connectionError}</AlertDescription>
              </Alert>
            ) : (
              <>
                <Spinner className="mx-auto size-6" aria-label="正在读取本地配置" />
                <p className="mt-3 text-sm">正在读取本地配置…</p>
              </>
            )}
            {connectionError && (
              <Button className="mt-4" variant="outline" onClick={() => void retryConnection()}>
                <RefreshCw aria-hidden="true" />
                重试
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <TooltipProvider>
      <div className="min-h-svh">
        <header className="border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4 sm:px-8">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ArrowLeftRight className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold">AI Switch</h1>
              <p className="text-xs text-muted-foreground">本地供应商配置</p>
            </div>
            <nav
              className="order-3 flex w-full gap-1 border-t pt-3 sm:order-none sm:ml-6 sm:w-auto sm:border-t-0 sm:pt-0"
              aria-label="工具页面"
            >
              <Button
                type="button"
                variant={view === 'claude-code' ? 'secondary' : 'ghost'}
                size="sm"
                disabled={pendingKey !== null}
                onClick={() => setView('claude-code')}
              >
                <ToolIcon toolId="claude-code" />
                Claude Code
              </Button>
              <Button
                type="button"
                variant={view === 'codex' ? 'secondary' : 'ghost'}
                size="sm"
                disabled={pendingKey !== null}
                onClick={() => setView('codex')}
              >
                <ToolIcon toolId="codex" />
                Codex
              </Button>
            </nav>
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
            <Button
              type="button"
              variant={view === 'settings' ? 'secondary' : 'ghost'}
              size="icon-sm"
              disabled={pendingKey !== null}
              onClick={() => setView('settings')}
              aria-label="打开设置"
              title="设置"
            >
              <Settings aria-hidden="true" />
            </Button>
            <Badge variant="outline" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />v
              {snapshot.appInfo.version}
            </Badge>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
          {view === 'settings' ? (
            <SettingsPage
              section={settingsSection}
              onSectionChange={setSettingsSection}
              providers={snapshot.providers}
              tools={snapshot.tools}
              backups={snapshot.backups}
              pendingKey={pendingKey}
              busy={pendingKey !== null}
              providerTool={settingsTool}
              onProviderToolChange={setSettingsTool}
              providerEditor={
                providerEditor && (
                  <ProviderForm
                    key={`${providerEditor.toolId}:${providerEditor.provider?.id ?? 'new'}`}
                    provider={providerEditor.provider}
                    toolId={providerEditor.toolId}
                    onCancel={() => setProviderEditor(null)}
                    onPendingChange={(pending) => setPendingKey(pending ? 'provider:save' : null)}
                    onSaved={(nextSnapshot, message) => {
                      adoptSnapshot(nextSnapshot)
                      setProviderEditor(null)
                      showSuccess(message)
                    }}
                  />
                )
              }
              onAddProvider={openProviderEditor}
              onEditProvider={(provider, toolId) => openProviderEditor(toolId, provider)}
              onDeleteProvider={(providerId) => void deleteProvider(providerId)}
              onSavePath={(toolId, path) => void savePath(toolId, path)}
              onPickPath={(toolId) => void pickPath(toolId)}
              onResetPath={(toolId) => void resetPath(toolId)}
              onOpenLocation={(input) => void openToolLocation(input)}
              onRestore={(backupId) => void restoreBackup(backupId)}
              onPendingChange={(pending) => setPendingKey(pending ? 'common:save' : null)}
              onCommonSaved={(nextSnapshot, message) => {
                adoptSnapshot(nextSnapshot)
                showSuccess(message)
              }}
            />
          ) : (
            <ToolConfigPage
              toolId={view}
              status={snapshot.tools[view]}
              providers={snapshot.providers}
              busy={pendingKey !== null}
              pendingProviderId={
                pendingKey?.startsWith(`apply:${view}:`)
                  ? pendingKey.slice(`apply:${view}:`.length)
                  : null
              }
              onApply={(toolId, providerId) => void applyProvider(toolId, providerId)}
              onAdd={openProviderEditor}
              onEdit={(provider) => openProviderEditor(view, provider)}
              onDelete={(providerId) => void deleteProvider(providerId)}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App

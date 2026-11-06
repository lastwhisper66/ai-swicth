import { startTransition, useEffect, useRef, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { TOOL_IDS } from '@shared/ipc'
import { APPLICATION_IDS, APPLICATION_INSTANCES, type ApplicationId } from '@shared/applications'
import type {
  ApiResult,
  ApplicationTask,
  ApplicationPreferences,
  AppSnapshot,
  CloudBackupOperationResult,
  CloudBackupSettingsInput,
  CloseBehavior,
  OpenToolLocationInput,
  ProviderSummary,
  OperationResponse,
  ToolId
} from '@shared/ipc'
import type { ProviderCleanupPreview } from '@shared/provider-cleanup'
import { ProviderCleanupDialog } from '@renderer/components/features/ProviderCleanupDialog'
import { AppSidebar } from '@renderer/components/AppSidebar'
import { ApplicationsPage } from '@renderer/components/features/ApplicationsPage'
import { TitleBar } from '@renderer/components/TitleBar'
import { ProviderForm } from '@renderer/components/features/ProviderForm'
import { SettingsPage, type SettingsSection } from '@renderer/components/features/SettingsPage'
import { ToolConfigPage } from '@renderer/components/features/ToolConfigPage'
import { CopilotPage } from '@renderer/components/features/CopilotPage'
import { SessionsPage } from '@renderer/components/features/SessionsPage'
import { ToolFeaturesPage } from '@renderer/components/features/ToolFeaturesPage'
import type { ToolPageSection } from '@renderer/components/features/ToolPageActions'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { useAppBootstrap } from '@renderer/hooks/use-app-bootstrap'
import { useApplications } from '@renderer/hooks/use-applications'
import { moveItem } from '@renderer/lib/sort-order'

type ProviderEditorState = { provider: ProviderSummary | null; toolId: ToolId } | null
type MainView = ToolId | 'settings' | 'applications' | 'copilot' | 'sessions'
const initialPreferences: ApplicationPreferences = {
  visible: Object.fromEntries(TOOL_IDS.map((id) => [id, true])) as Record<ToolId, boolean>,
  wsl: {},
  order: [...APPLICATION_IDS],
  sidebarCollapsed: false
}

function App(): React.JSX.Element {
  const {
    snapshot,
    setSnapshot,
    connectionError,
    toolErrors,
    initialize,
    loadTool,
    replaceSnapshot,
    updateInstallation
  } = useAppBootstrap()
  const [applicationTasks, setApplicationTasks] = useState<ApplicationTask[]>([])
  const completedApplicationTasks = useRef(new Set<string>())
  const [providerEditor, setProviderEditor] = useState<ProviderEditorState>(null)
  const [toolSection, setToolSection] = useState<ToolPageSection>('home')
  const [toolNavigation, setToolNavigation] = useState(0)
  const [view, setView] = useState<MainView>('claude-code')
  const applicationList = useApplications(applicationTasks, view === 'applications')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const cleaningCodexProviders = useRef(false)
  const [codexCleanup, setCodexCleanup] = useState<{
    toolId: 'codex' | 'codex-wsl'
    preview: ProviderCleanupPreview
  } | null>(null)
  const [codexCleanupError, setCodexCleanupError] = useState<string | null>(null)
  const [collapseSaving, setCollapseSaving] = useState(false)
  const [applicationOrderSaving, setApplicationOrderSaving] = useState(false)
  const savingApplicationOrder = useRef(false)
  const savingProviderOrder = useRef(false)
  const savingCollapsed = useRef(false)

  useEffect(() => {
    let active = true
    void initialize().then((result) => {
      if (active && result)
        setView((current) =>
          current !== 'settings' &&
          current !== 'applications' &&
          current !== 'copilot' &&
          current !== 'sessions' &&
          !result.applicationPreferences.visible[current]
            ? 'applications'
            : current
        )
    })
    return () => {
      active = false
    }
  }, [initialize])

  useEffect(() => {
    const api = window.api
    if (!api) return
    let active = true
    const unsubscribe = api.onApplicationTaskChanged((task) => {
      if (!active) return
      setApplicationTasks((previous) =>
        [...previous.filter((entry) => entry.id !== task.id), task].slice(-30)
      )
      if (task.state === 'running' || completedApplicationTasks.current.has(task.id)) return
      completedApplicationTasks.current.add(task.id)
      if (task.state === 'failed') toast.error(task.message, { duration: 8000 })
      else toast.success(task.message)
      const toolId = APPLICATION_INSTANCES[task.applicationId].configurationToolId
      const installation = task.result?.installation
      const visible = task.sidebarVisible
      if (toolId && installation) updateInstallation(toolId, installation)
      if (toolId && (installation || typeof visible === 'boolean')) {
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                applicationPreferences:
                  typeof visible === 'boolean'
                    ? {
                        ...previous.applicationPreferences,
                        visible: { ...previous.applicationPreferences.visible, [toolId]: visible }
                      }
                    : previous.applicationPreferences
              }
            : previous
        )
        if (visible === false) setView((current) => (current === toolId ? 'applications' : current))
      }
    })
    void api
      .getApplicationTasks()
      .then((response) => {
        if (!active || !response.ok) return
        setApplicationTasks((previous) => {
          const merged = new Map(response.value.map((task) => [task.id, task]))
          for (const task of previous) merged.set(task.id, task)
          return [...merged.values()].slice(-30)
        })
      })
      .catch(() => {})
    return () => {
      active = false
      unsubscribe()
    }
  }, [setSnapshot, updateInstallation])

  async function setApplicationVisibility(toolId: ToolId, visible: boolean): Promise<boolean> {
    try {
      const response = await window.api.setApplicationVisibility({ toolId, visible })
      if (!response.ok) {
        showError(response.error.message)
        return false
      }
      setSnapshot((previous) =>
        previous
          ? {
              ...previous,
              applicationPreferences: {
                ...previous.applicationPreferences,
                visible: {
                  ...previous.applicationPreferences.visible,
                  [toolId]: response.value.visible[toolId]
                }
              }
            }
          : previous
      )
      if (!visible && view === toolId) setView('applications')
      return true
    } catch {
      showError('无法保存侧栏显示设置，请重新打开应用后重试。')
      return false
    }
  }

  async function setApplicationOrder(order: ApplicationId[]): Promise<boolean> {
    if (savingApplicationOrder.current) return false
    savingApplicationOrder.current = true
    setApplicationOrderSaving(true)
    try {
      const response = await window.api.setApplicationOrder({ order })
      if (!response.ok) {
        showError(response.error.message)
        return false
      }
      setSnapshot((previous) =>
        previous
          ? {
              ...previous,
              applicationPreferences: {
                ...previous.applicationPreferences,
                order: response.value.order
              }
            }
          : previous
      )
      return true
    } catch {
      showError('无法保存应用顺序，请完整重启应用后重试。')
      return false
    } finally {
      savingApplicationOrder.current = false
      setApplicationOrderSaving(false)
    }
  }

  async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
    if (!snapshot || savingCollapsed.current) return
    const previousCollapsed = snapshot.applicationPreferences.sidebarCollapsed
    const updateCollapsed = (value: boolean): void =>
      setSnapshot((previous) =>
        previous
          ? {
              ...previous,
              applicationPreferences: {
                ...previous.applicationPreferences,
                sidebarCollapsed: value
              }
            }
          : previous
      )
    savingCollapsed.current = true
    setCollapseSaving(true)
    updateCollapsed(collapsed)
    try {
      const response = await window.api.setSidebarCollapsed({ collapsed })
      if (!response.ok) {
        updateCollapsed(previousCollapsed)
        showError(response.error.message)
      }
    } catch {
      updateCollapsed(previousCollapsed)
      showError('无法保存侧边栏状态，请完整重启应用后重试。')
    } finally {
      savingCollapsed.current = false
      setCollapseSaving(false)
    }
  }

  async function moveProvider(providerId: string, targetId: string): Promise<void> {
    if (!snapshot || pendingKey || savingProviderOrder.current) return
    const previous = snapshot.providers
    const order = previous.map((provider) => provider.id)
    const nextOrder = moveItem(order, providerId, targetId)
    if (nextOrder === order) return
    const byId = new Map(previous.map((provider) => [provider.id, provider]))
    const updateProviders = (providers: ProviderSummary[]): void =>
      setSnapshot((current) => (current ? { ...current, providers } : current))
    savingProviderOrder.current = true
    setPendingKey('providers:order')
    updateProviders(nextOrder.map((id) => byId.get(id)!))
    try {
      const response = await window.api.setProviderOrder({ order: nextOrder })
      if (!response.ok) {
        updateProviders(previous)
        showError(response.error.message)
        return
      }
      updateProviders(response.value)
    } catch {
      updateProviders(previous)
      showError('无法保存供应商顺序，请完整重启应用后重试。')
    } finally {
      savingProviderOrder.current = false
      setPendingKey(null)
    }
  }

  function adoptSnapshot(nextSnapshot: AppSnapshot): void {
    startTransition(() => {
      replaceSnapshot(nextSnapshot)
      setView((current) =>
        current !== 'settings' &&
        current !== 'applications' &&
        current !== 'copilot' &&
        current !== 'sessions' &&
        !nextSnapshot.applicationPreferences.visible[current]
          ? 'applications'
          : current
      )
    })
  }

  async function retryConnection(): Promise<void> {
    const result = await initialize()
    if (result)
      setView((current) =>
        current !== 'settings' &&
        current !== 'applications' &&
        current !== 'copilot' &&
        current !== 'sessions' &&
        !result.applicationPreferences.visible[current]
          ? 'applications'
          : current
      )
  }

  async function deleteProvider(providerId: string): Promise<void> {
    await runSnapshotOperation(
      `delete:${providerId}`,
      () => window.api.deleteProvider({ id: providerId }),
      '供应商已删除。'
    )
  }

  async function setCloseBehavior(closeBehavior: CloseBehavior): Promise<void> {
    await runSnapshotOperation(
      'settings:save',
      () => window.api.setAppSettings({ closeBehavior }),
      closeBehavior === 'tray' ? '关闭窗口后将保留在系统托盘。' : '关闭窗口后将直接退出应用程序。'
    )
  }

  async function saveCloudBackupSettings(input: CloudBackupSettingsInput): Promise<boolean> {
    return runSnapshotOperation(
      'cloud:settings',
      () => window.api.setCloudBackupSettings(input),
      '云端备份设置已保存。'
    )
  }

  async function testCloudBackup(input: CloudBackupSettingsInput): Promise<void> {
    setPendingKey('cloud:test')
    try {
      const result = await window.api.testCloudBackup(input)
      if (!result.ok) return showError(result.error.message)
      showSuccess(result.value.message)
    } catch {
      showError('无法连接本地应用，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function saveCloudBackupPassword(encryptionPassword: string): Promise<boolean> {
    try {
      const result = await window.api.setCloudBackupPassword({ encryptionPassword })
      if (!result.ok) {
        showError(result.error.message)
        return false
      }
      adoptSnapshot(result.value)
      return true
    } catch {
      showError('备份密码未能保存到本机，请重新打开应用后重试。')
      return false
    }
  }

  async function uploadCloudBackup(encryptionPassword: string): Promise<void> {
    await runCloudBackupOperation('cloud:upload', () =>
      window.api.uploadCloudBackup({ encryptionPassword })
    )
  }

  async function restoreCloudBackup(encryptionPassword: string, objectKey?: string): Promise<void> {
    await runCloudBackupOperation('cloud:restore', () =>
      window.api.restoreCloudBackup({ encryptionPassword, objectKey })
    )
  }

  async function restoreConfigurationBackup(backupId: string): Promise<void> {
    await runSnapshotOperation(
      `configuration:restore:${backupId}`,
      () => window.api.restoreConfigurationBackup({ backupId }),
      '已恢复供应商和通用配置，请手动应用到工具。'
    )
  }

  async function runCloudBackupOperation(
    key: string,
    operation: () => Promise<ApiResult<OperationResponse<CloudBackupOperationResult>>>
  ): Promise<void> {
    setPendingKey(key)
    try {
      const result = await operation()
      if (!result.ok) return showError(result.error.message)
      adoptSnapshot(result.value.snapshot)
      const { message, warnings } = result.value.operation
      if (warnings.length > 0) showWarning(`${message} ${warnings.join(' ')}`)
      else showSuccess(message)
    } catch {
      showError('无法连接本地应用，请重新打开应用后重试。')
    } finally {
      setPendingKey(null)
    }
  }

  async function applyProvider(toolId: ToolId, providerId: string, modelId: string): Promise<void> {
    const key = `apply:${toolId}:${providerId}`
    setPendingKey(key)
    try {
      const result = await window.api.applyProvider({ toolId, providerId, modelId })
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

  async function previewCodexCleanup(toolId: 'codex' | 'codex-wsl'): Promise<void> {
    if (pendingKey || cleaningCodexProviders.current) return
    cleaningCodexProviders.current = true
    setPendingKey(`cleanup:${toolId}`)
    try {
      const result = await window.api.previewCodexCleanup({ toolId })
      if (!result.ok) {
        setCodexCleanupError(result.error.message)
        return showError(result.error.message)
      }
      setCodexCleanup({ toolId, preview: result.value })
      setCodexCleanupError(null)
    } catch {
      const message = '无法读取清理预览，请重新打开应用后重试。'
      setCodexCleanupError(message)
      showError(message)
    } finally {
      cleaningCodexProviders.current = false
      setPendingKey(null)
    }
  }

  async function confirmCodexCleanup(): Promise<void> {
    if (pendingKey || cleaningCodexProviders.current || !codexCleanup?.preview.hasChanges) return
    cleaningCodexProviders.current = true
    const { toolId, preview } = codexCleanup
    setPendingKey(`cleanup:${toolId}`)
    try {
      const result = await window.api.cleanupCodexProviders({ toolId, revision: preview.revision })
      if (!result.ok) {
        setCodexCleanupError(result.error.message)
        return showError(result.error.message)
      }
      setCodexCleanup(null)
      adoptSnapshot(result.value.snapshot)
      const { message, warnings } = result.value.operation
      if (warnings.length) showWarning(`${message} ${warnings.join(' ')}`)
      else showSuccess(message)
    } catch {
      const message = '清理未完成，请重新预览后重试。'
      setCodexCleanupError(message)
      showError(message)
    } finally {
      cleaningCodexProviders.current = false
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
  ): Promise<boolean> {
    setPendingKey(key)
    try {
      const result = await operation()
      if (!result.ok) {
        showError(result.error.message)
        return false
      }
      adoptSnapshot(result.value)
      showSuccess(successMessage)
      return true
    } catch {
      showError('无法连接本地应用，请重新打开应用后重试。')
      return false
    } finally {
      setPendingKey(null)
    }
  }

  function showSuccess(message: string): void {
    toast.success(message, { duration: 4000 })
  }

  function showError(message: string): void {
    toast.error(message, { duration: 8000 })
  }

  function showWarning(message: string): void {
    toast.warning(message, { duration: 8000 })
  }

  function openProviderEditor(toolId: ToolId, provider: ProviderSummary | null = null): void {
    setView(toolId)
    setToolSection('editor')
    setProviderEditor({ provider, toolId })
  }

  return (
    <TooltipProvider>
      <div className="flex h-svh min-w-0 overflow-hidden">
        <AppSidebar
          view={view}
          preferences={snapshot?.applicationPreferences ?? initialPreferences}
          ready={!!snapshot && !applicationOrderSaving}
          busy={pendingKey !== null}
          collapseSaving={collapseSaving}
          onCollapsedChange={(collapsed) => void setSidebarCollapsed(collapsed)}
          onOrderChange={setApplicationOrder}
          onViewChange={(nextView) => {
            if (nextView === 'settings') setSettingsSection('general')
            setProviderEditor(null)
            setToolSection('home')
            setToolNavigation((current) => current + 1)
            setView(nextView)
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TitleBar />
          <main
            className={`min-h-0 min-w-0 flex-1 ${view === 'sessions' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-gutter-both'}`}
          >
            <div
              className={`w-full min-w-0 ${view === 'sessions' ? 'h-full px-4 py-4 lg:px-6' : 'px-5 py-6 lg:px-8 lg:py-8'}`}
            >
              {connectionError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{connectionError}</AlertDescription>
                  <Button size="sm" variant="outline" onClick={() => void retryConnection()}>
                    <RefreshCw />
                    重试
                  </Button>
                </Alert>
              )}
              {view === 'sessions' ? (
                <SessionsPage
                  onBusyChange={(pending) =>
                    setPendingKey((current) =>
                      pending
                        ? (current ?? 'sessions:operation')
                        : current === 'sessions:operation'
                          ? null
                          : current
                    )
                  }
                />
              ) : view === 'copilot' ? (
                <CopilotPage
                  key={toolNavigation}
                  busy={pendingKey !== null}
                  onBusyChange={(pending) =>
                    setPendingKey((current) =>
                      pending
                        ? (current ?? 'copilot:operation')
                        : current === 'copilot:operation'
                          ? null
                          : current
                    )
                  }
                />
              ) : view === 'applications' ? (
                <ApplicationsPage
                  list={applicationList}
                  preferences={snapshot?.applicationPreferences ?? initialPreferences}
                  preferencesReady={!!snapshot && !applicationOrderSaving}
                  tasks={applicationTasks}
                  onVisibilityChange={setApplicationVisibility}
                  onOrderChange={setApplicationOrder}
                  onTaskStarted={(task) =>
                    setApplicationTasks((previous) => {
                      const current = previous.find((entry) => entry.id === task.id)
                      return current ? previous : [...previous, task].slice(-30)
                    })
                  }
                />
              ) : view === 'settings' && snapshot ? (
                <SettingsPage
                  section={settingsSection}
                  appInfo={snapshot.appInfo}
                  settings={snapshot.settings}
                  onCloseBehaviorChange={(behavior) => void setCloseBehavior(behavior)}
                  onSectionChange={setSettingsSection}
                  backups={snapshot.backups}
                  cloudBackup={snapshot.settings.cloudBackup}
                  pendingKey={pendingKey}
                  busy={pendingKey !== null}
                  onRestore={(backupId) => void restoreBackup(backupId)}
                  onSaveCloudBackup={saveCloudBackupSettings}
                  onSaveCloudBackupPassword={saveCloudBackupPassword}
                  onTestCloudBackup={(input) => void testCloudBackup(input)}
                  onUploadCloudBackup={(password) => void uploadCloudBackup(password)}
                  onRestoreCloudBackup={(password, objectKey) =>
                    void restoreCloudBackup(password, objectKey)
                  }
                  onRestoreConfigurationBackup={(backupId) =>
                    void restoreConfigurationBackup(backupId)
                  }
                  configurationBackups={snapshot.configurationBackups}
                  onPendingChange={(pending) =>
                    setPendingKey((current) =>
                      pending
                        ? (current ?? 'copilot:operation')
                        : current === 'copilot:operation'
                          ? null
                          : current
                    )
                  }
                />
              ) : view === 'settings' ? (
                <div className="space-y-5" aria-busy="true">
                  <h1 className="font-semibold">设置</h1>
                  <div className="h-10 animate-pulse rounded-lg bg-muted" />
                  <div className="h-48 animate-pulse rounded-lg border bg-muted/30" />
                  <span className="sr-only">正在读取本地设置</span>
                </div>
              ) : (
                <ToolConfigPage
                  toolId={view}
                  status={snapshot?.tools[view]}
                  tools={snapshot?.tools ?? {}}
                  providers={snapshot?.providers}
                  statusError={toolErrors[view] ?? (!snapshot ? connectionError : null)}
                  onRetry={() => void (snapshot ? loadTool(view) : retryConnection())}
                  busy={pendingKey !== null}
                  pendingProviderId={
                    pendingKey?.startsWith(`apply:${view}:`)
                      ? pendingKey.slice(`apply:${view}:`.length)
                      : null
                  }
                  onApply={(toolId, providerId, modelId) =>
                    void applyProvider(toolId, providerId, modelId)
                  }
                  onCleanupProviders={(toolId) => void previewCodexCleanup(toolId)}
                  cleanupPending={pendingKey === `cleanup:${view}`}
                  onAdd={openProviderEditor}
                  onEdit={(provider) => openProviderEditor(view, provider)}
                  onDelete={(providerId) => void deleteProvider(providerId)}
                  onMove={moveProvider}
                  section={toolSection}
                  onHome={() => {
                    setProviderEditor(null)
                    setToolSection('home')
                  }}
                  onConfigure={() => {
                    setProviderEditor(null)
                    setToolSection('configuration')
                  }}
                >
                  {providerEditor && providerEditor.toolId === view ? (
                    <ProviderForm
                      key={`${view}:${providerEditor.provider?.id ?? 'new'}`}
                      provider={providerEditor.provider}
                      toolId={view}
                      currentModelId={
                        providerEditor.provider?.id === snapshot?.tools[view]?.currentProviderId
                          ? (snapshot?.tools[view]?.currentModelId ?? null)
                          : null
                      }
                      onCancel={() => {
                        setProviderEditor(null)
                        setToolSection('home')
                      }}
                      onPendingChange={(pending) => setPendingKey(pending ? 'provider:save' : null)}
                      onSaved={(nextSnapshot, message) => {
                        adoptSnapshot(nextSnapshot)
                        setProviderEditor(null)
                        setToolSection('home')
                        showSuccess(message)
                      }}
                    />
                  ) : toolSection === 'configuration' && snapshot ? (
                    <ToolFeaturesPage
                      key={view}
                      toolId={view}
                      providers={snapshot.providers}
                      status={snapshot.tools[view]}
                      statusError={toolErrors[view]}
                      busy={pendingKey !== null}
                      onRetry={() => void loadTool(view)}
                      onPickPath={(toolId) => void pickPath(toolId)}
                      onResetPath={(toolId) => void resetPath(toolId)}
                      onOpenLocation={(input) => void openToolLocation(input)}
                      onPendingChange={(pending) => setPendingKey(pending ? 'common:save' : null)}
                      onSaved={(nextSnapshot, message) => {
                        adoptSnapshot(nextSnapshot)
                        showSuccess(message)
                      }}
                    />
                  ) : null}
                </ToolConfigPage>
              )}
            </div>
          </main>
        </div>
      </div>
      <ProviderCleanupDialog
        toolName={codexCleanup?.toolId === 'codex-wsl' ? 'Codex WSL' : 'Codex'}
        preview={codexCleanup?.preview ?? null}
        busy={pendingKey !== null}
        error={codexCleanupError}
        onClose={() => setCodexCleanup(null)}
        onRefresh={() => {
          if (codexCleanup) void previewCodexCleanup(codexCleanup.toolId)
        }}
        onConfirm={() => void confirmCodexCleanup()}
      />
    </TooltipProvider>
  )
}

export default App

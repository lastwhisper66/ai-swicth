import { useEffect, useRef, useState } from 'react'
import {
  Ban,
  FolderOpen,
  Info,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2
} from 'lucide-react'
import { toast } from 'sonner'
import type { ApiResult } from '@shared/ipc'
import type { CopilotProvider, CopilotSnapshot } from '@shared/copilot'
import type { ProviderCleanupPreview } from '@shared/provider-cleanup'
import { ProviderCleanupDialog } from './ProviderCleanupDialog'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { SortableList } from '@renderer/components/SortableList'
import { moveItem } from '@renderer/lib/sort-order'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Card, CardContent, CardHeader } from '@renderer/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { CopilotProviderForm } from './CopilotProviderForm'
import { CopilotProviderRow } from './CopilotProviderRow'
import { ToolPageActions, type ToolPageSection } from './ToolPageActions'
type Confirmation = {
  title: string
  description: string
  operation: () => Promise<ApiResult<unknown>>
}

export function CopilotPage({
  onBusyChange,
  busy: externalBusy = false,
  mode: context = 'home'
}: {
  onBusyChange: (busy: boolean) => void
  busy?: boolean
  mode?: 'home' | 'backups'
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<CopilotSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setBusy] = useState(false)
  const running = useRef(false)
  const busy = externalBusy || pending
  const [section, setSection] = useState<ToolPageSection>('home')
  const [editor, setEditor] = useState<CopilotProvider | 'new' | null>(null)
  const mode = context === 'backups' ? 'backups' : section === 'configuration' ? 'paths' : 'home'
  const [selected, setSelected] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [cleanupPreview, setCleanupPreview] = useState<ProviderCleanupPreview | null>(null)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const selectedToDisable = selected.filter((id) =>
    snapshot?.providers.some((provider) => provider.id === id && provider.canDisable)
  )
  const fileUnavailable = !snapshot || ['invalid', 'unreadable'].includes(snapshot.fileState)

  function adopt(next: CopilotSnapshot): void {
    setSnapshot(next)
    setSelected((current) =>
      current.filter((id) => next.providers.some((provider) => provider.id === id))
    )
  }

  useEffect(() => {
    let active = true
    void window.api.copilot
      .snapshot()
      .then((response) => {
        if (!active) return
        if (response.ok) adopt(response.value)
        else setError(response.error.message)
      })
      .catch(() => {
        if (active) setError('无法读取 Copilot 配置，请重新打开应用后重试。')
      })
    return () => {
      active = false
    }
  }, [])

  async function reload(): Promise<void> {
    const response = await window.api.copilot.snapshot()
    if (response.ok) {
      adopt(response.value)
      setError(null)
    } else setError(response.error.message)
  }

  async function run<T>(
    operation: () => Promise<ApiResult<T>>,
    success?: string
  ): Promise<{ value: T } | null> {
    if (busy || running.current) return null
    running.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const response = await operation()
      if (!response.ok) {
        setError(response.error.message)
        toast.error(response.error.message)
        return null
      }
      if (success || typeof response.value === 'string')
        toast.success(success ?? String(response.value))
      return { value: response.value }
    } catch {
      const message = '无法连接本地应用，请重新打开应用后重试。'
      setError(message)
      toast.error(message)
      return null
    } finally {
      running.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  async function mutate(
    operation: () => Promise<ApiResult<unknown>>,
    success?: string
  ): Promise<void> {
    await run(async () => {
      const result = await operation()
      if (result.ok) {
        setConfirmation(null)
        await reload()
      }
      return result
    }, success)
  }

  async function edit(id: string): Promise<void> {
    const result = await run(() => window.api.copilot.getProvider({ id }))
    if (result) {
      setSection('editor')
      setEditor(result.value)
    }
  }

  async function moveProvider(providerId: string, targetId: string): Promise<void> {
    if (!snapshot || busy || running.current) return
    const previous = snapshot
    const order = previous.providers.map((provider) => provider.id)
    const nextOrder = moveItem(order, providerId, targetId)
    if (nextOrder === order) return
    const byId = new Map(previous.providers.map((provider) => [provider.id, provider]))
    setSnapshot({ ...previous, providers: nextOrder.map((id) => byId.get(id)!) })
    const result = await run(() => window.api.copilot.setProviderOrder({ order: nextOrder }))
    if (result) adopt(result.value)
    else setSnapshot(previous)
  }

  async function apply(providerIds: string[]): Promise<void> {
    if (!snapshot) return
    await mutate(() => window.api.copilot.apply({ providerIds, revision: snapshot.revision }))
  }

  async function disable(providerIds: string[]): Promise<void> {
    if (!snapshot) return
    await mutate(() => window.api.copilot.disable({ providerIds, revision: snapshot.revision }))
  }

  async function showCleanupPreview(): Promise<void> {
    if (busy || running.current) return
    const result = await run(() => window.api.copilot.previewCleanup())
    if (result) {
      setCleanupPreview(result.value)
      setCleanupError(null)
    } else setCleanupError('无法更新清理预览，请重新预览后重试。')
  }

  async function confirmCleanup(): Promise<void> {
    if (busy || running.current || !cleanupPreview?.hasChanges) return
    const revision = cleanupPreview.revision
    const result = await run(async () => {
      const response = await window.api.copilot.cleanup({ revision })
      if (response.ok) {
        setCleanupPreview(null)
        await reload()
      } else setCleanupError(response.error.message)
      return response
    })
    if (!result) setCleanupError((current) => current ?? '清理未完成，请重新预览后重试。')
  }

  async function pickDirectory(): Promise<void> {
    const picked = await run(() => window.api.copilot.pickPath())
    if (picked?.value)
      await mutate(
        () => window.api.copilot.setPath({ directory: picked.value }),
        'Copilot 配置目录已更新。'
      )
  }

  function addProvider(): void {
    setSection('editor')
    setEditor('new')
  }

  const header =
    context === 'home' ? (
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="bg-muted/35 py-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 basis-80 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
                <ToolIcon toolId="copilot" className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold">VS Code Copilot</h1>
                  <Badge
                    variant={
                      snapshot?.fileState === 'ready'
                        ? 'secondary'
                        : snapshot && fileUnavailable
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {!snapshot
                      ? '正在确认'
                      : snapshot.fileState === 'ready'
                        ? '配置可用'
                        : snapshot.fileState === 'missing'
                          ? '配置未创建'
                          : '配置需处理'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  管理 BYOK 供应商与模型，应用到当前 VS Code Profile。
                </p>
              </div>
            </div>
            <ToolPageActions
              section={section}
              busy={busy || !snapshot}
              onHome={() => {
                setEditor(null)
                setSection('home')
              }}
              onAdd={addProvider}
              onConfigure={() => {
                setEditor(null)
                setSection('configuration')
              }}
            />
          </div>
        </CardHeader>
        {snapshot && snapshot.fileState !== 'ready' && (
          <CardContent className="space-y-4 border-t py-5">
            <Alert className="bg-muted/25" role="status">
              <Info aria-hidden="true" />
              <AlertDescription className="text-xs leading-5 wrap-anywhere">
                {snapshot.message}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    ) : null

  if (editor !== null)
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <CopilotProviderForm
          key={editor === 'new' ? 'new' : editor.id}
          provider={editor === 'new' ? null : editor}
          onCancel={() => {
            setEditor(null)
            setSection('home')
          }}
          onBusyChange={(pending) => {
            setBusy(pending)
            onBusyChange(pending)
          }}
          onSaved={() => {
            setEditor(null)
            setSection('home')
            toast.success('Copilot 供应商已保存，尚未写入 VS Code。')
            void reload()
          }}
        />
      </div>
    )

  return (
    <div className="space-y-6">
      {header}
      {mode === 'home' && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              供应商
              {snapshot && <Badge variant="secondary">{snapshot.providers.length}</Badge>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              点击“应用”将供应商及模型写入 VS Code，再在聊天中选择模型；可拖动手柄调整供应商顺序。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy || !snapshot || ['invalid', 'unreadable'].includes(snapshot.fileState)}
              onClick={() => void showCleanupPreview()}
              title="预览当前配置文件中未在本应用保存的供应商分组，确认后清理并自动备份"
            >
              <Trash2 />
              清理未管理供应商
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await reload()
                  return { ok: true, value: undefined }
                })
              }
            >
              <RefreshCw />
              刷新
            </Button>
          </div>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!snapshot ? (
        <div className="space-y-3" aria-busy={!error} aria-label="正在读取供应商">
          <div className="h-28 animate-pulse rounded-xl border bg-muted/30" />
          <div className="h-28 animate-pulse rounded-xl border bg-muted/30" />
        </div>
      ) : (
        <>
          {mode === 'paths' && (
            <section className="space-y-4 rounded-lg border p-5" aria-label="Copilot 配置路径">
              <div>
                <h2 className="text-base font-semibold">功能配置</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  配置当前 VS Code Profile
                  的模型文件位置；协议、模型能力和高级选项在各供应商中编辑。
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium">VS Code Copilot</h2>
                <Badge variant="outline">
                  {snapshot.customPath ? '自定义目录' : 'VS Code 默认目录'}
                </Badge>
              </div>
              <Button
                variant="link"
                className="h-auto max-w-full justify-start p-0 text-left whitespace-normal"
                disabled={busy}
                onClick={() =>
                  void run(() => window.api.copilot.openLocation({ target: 'config' }))
                }
              >
                <span className="break-all font-mono text-xs">{snapshot.path}</span>
              </Button>
              <p
                className={`text-sm leading-6 ${['invalid', 'unreadable'].includes(snapshot.fileState) ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {snapshot.message}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void pickDirectory()}>
                  <FolderOpen />
                  更换目录
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() => window.api.copilot.openLocation({ target: 'directory' }))
                  }
                >
                  打开目录
                </Button>
                {snapshot.customPath && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () => window.api.copilot.setPath({ directory: null }),
                        '已恢复 VS Code 默认目录。'
                      )
                    }
                  >
                    <RotateCcw />
                    恢复默认目录
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                更换目录可选择 VS Code Insiders、便携版或 User/profiles/&lt;id&gt; 目录。
              </p>
            </section>
          )}
          {mode === 'home' && (
            <section className="space-y-3" aria-label="Copilot 供应商列表">
              {snapshot.providers.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/25 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        disabled={busy}
                        checked={
                          selected.length === snapshot.providers.length
                            ? true
                            : selected.length
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={(checked) =>
                          setSelected(checked === true ? snapshot.providers.map((p) => p.id) : [])
                        }
                      />
                      全选
                    </label>
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                      已选择 {selected.length} 项
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={busy || !selected.length || fileUnavailable}
                      onClick={() => void apply([...selected])}
                    >
                      <Play />
                      批量应用{selected.length ? `（${selected.length}）` : ''}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !selectedToDisable.length || fileUnavailable}
                      onClick={() => void disable(selectedToDisable)}
                    >
                      <Ban />
                      批量禁用{selectedToDisable.length ? `（${selectedToDisable.length}）` : ''}
                    </Button>
                  </div>
                </div>
              )}
              {snapshot.providers.length === 0 ? (
                <Empty className="border bg-card py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ToolIcon toolId="copilot" />
                    </EmptyMedia>
                    <EmptyTitle>尚无适用于 VS Code Copilot 的供应商</EmptyTitle>
                    <EmptyDescription>添加连接信息和模型后，即可在这里应用。</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button disabled={busy} onClick={addProvider}>
                      <Plus aria-hidden="true" />
                      添加供应商
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <SortableList
                  items={snapshot.providers.map((provider) => ({
                    id: provider.id,
                    label: provider.name
                  }))}
                  label="VS Code Copilot 供应商"
                  disabled={busy}
                  onMove={moveProvider}
                  renderItem={(providerId, handle) => {
                    const provider = snapshot.providers.find(
                      (provider) => provider.id === providerId
                    )!
                    return (
                      <CopilotProviderRow
                        provider={provider}
                        dragHandle={handle}
                        selected={selected.includes(provider.id)}
                        busy={busy}
                        fileUnavailable={fileUnavailable}
                        onSelectedChange={(checked) =>
                          setSelected((current) =>
                            checked
                              ? [...current, provider.id]
                              : current.filter((id) => id !== provider.id)
                          )
                        }
                        onApply={() => void apply([provider.id])}
                        onEdit={() => void edit(provider.id)}
                        onDisable={() => void disable([provider.id])}
                        onDelete={() =>
                          setConfirmation({
                            title: `删除 ${provider.name}？`,
                            description:
                              '将从 AI Switch 和所有已应用的 VS Code 配置路径中删除此供应商。客户端配置写入前会备份；存在外部修改或写入失败时保留供应商记录。',
                            operation: () =>
                              window.api.copilot.deleteProvider({
                                id: provider.id,
                                revision: snapshot.revision
                              })
                          })
                        }
                      />
                    )
                  }}
                />
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                禁用会从当前 VS Code
                配置中移除供应商，应用内记录仍保留；删除会同时移除应用内记录和所有已应用路径中的配置。BYOK
                用于聊天及部分辅助任务，不替代行内代码补全。
              </p>
            </section>
          )}
          {mode === 'backups' && (
            <section className="space-y-3 rounded-lg border p-5" aria-label="Copilot 备份恢复">
              <h2 className="text-sm font-medium">
                VS Code Copilot 备份 · {snapshot.backups.length}
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                应用、禁用、删除、清理和恢复前自动保存原文，保留最近 20
                份；恢复会覆盖整个文件，并保留恢复前的安全备份。备份仅能恢复到原路径。
              </p>
              {snapshot.backups.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚无写入备份。</p>
              ) : (
                <details>
                  <summary className="cursor-pointer text-sm">查看备份</summary>
                  <div className="mt-3 divide-y">
                    {snapshot.backups.map((backup) => (
                      <div
                        key={backup.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm">
                            {new Date(backup.createdAt).toLocaleString()} ·{' '}
                            {
                              {
                                sync: '应用前',
                                remove: '禁用前',
                                delete: '删除前',
                                restore: '恢复前',
                                cleanup: '清理前'
                              }[backup.reason]
                            }
                            {!backup.originalFileExisted && ' · 原文件不存在'}
                          </p>
                          <p className="mt-1 text-xs break-all text-muted-foreground">
                            {backup.path}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || backup.path !== snapshot.path}
                          onClick={() =>
                            setConfirmation({
                              title: '恢复此 Copilot 备份？',
                              description: `将整个文件恢复到 ${new Date(backup.createdAt).toLocaleString()} 前的内容，包含当时的其他供应商。当前内容会先备份。`,
                              operation: () =>
                                window.api.copilot.restore({
                                  id: backup.id,
                                  revision: snapshot.revision
                                })
                            })
                          }
                        >
                          <Undo2 />
                          恢复
                        </Button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}
        </>
      )}
      <ProviderCleanupDialog
        toolName="VS Code Copilot"
        preview={cleanupPreview}
        busy={busy}
        error={cleanupError}
        onClose={() => setCleanupPreview(null)}
        onRefresh={() => void showCleanupPreview()}
        onConfirm={() => void confirmCleanup()}
      />
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (confirmation) void mutate(confirmation.operation)
              }}
            >
              {busy ? '处理中…' : '确认'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

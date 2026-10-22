import { useState } from 'react'
import { FolderOpen, LoaderCircle, RotateCcw, Save, Undo2 } from 'lucide-react'
import type { BackupSummary, ToolId, ToolStatus } from '@shared/ipc'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Separator } from '@renderer/components/ui/separator'

interface SettingsBackupsProps {
  tools: Record<ToolId, ToolStatus>
  backups: BackupSummary[]
  pendingKey: string | null
  busy: boolean
  onSavePath: (toolId: ToolId, path: string) => void
  onPickPath: (toolId: ToolId) => void
  onResetPath: (toolId: ToolId) => void
  onRestore: (backupId: string) => void
}

const toolNames: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex'
}

export function SettingsBackups({
  tools,
  backups,
  pendingKey,
  busy,
  onSavePath,
  onPickPath,
  onResetPath,
  onRestore
}: SettingsBackupsProps): React.JSX.Element {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">配置路径</h2>
          <p className="mt-1 text-sm text-muted-foreground">每个工具独立保存路径设置。</p>
        </div>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {(['claude-code', 'codex'] as const).map((toolId) => (
            <ToolPathEditor
              key={`${toolId}:${tools[toolId].path}`}
              toolId={toolId}
              status={tools[toolId]}
              pending={pendingKey?.startsWith(`path:${toolId}`) ?? false}
              busy={busy}
              onSave={onSavePath}
              onPick={onPickPath}
              onReset={onResetPath}
            />
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">备份记录</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            应用和恢复前自动创建加密备份，每个工具保留最近 20 份。
          </p>
        </div>
        {backups.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            尚无备份记录
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {backups.map((backup, index) => (
              <div key={backup.id}>
                {index > 0 && <Separator />}
                <BackupRow
                  backup={backup}
                  pending={pendingKey === `restore:${backup.id}`}
                  busy={busy}
                  onRestore={onRestore}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ToolPathEditor({
  toolId,
  status,
  pending,
  busy,
  onSave,
  onPick,
  onReset
}: {
  toolId: ToolId
  status: ToolStatus
  pending: boolean
  busy: boolean
  onSave: (toolId: ToolId, path: string) => void
  onPick: (toolId: ToolId) => void
  onReset: (toolId: ToolId) => void
}): React.JSX.Element {
  const [path, setPath] = useState(status.path)

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[9rem_minmax(0,1fr)_auto] lg:items-end">
      <div className="space-y-1">
        <div className="font-medium">{toolNames[toolId]}</div>
        <Badge variant="outline">
          {status.pathSource === 'custom'
            ? '自定义路径'
            : status.pathSource === 'environment'
              ? '环境变量'
              : '默认路径'}
        </Badge>
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${toolId}-path`}>配置文件</Label>
        <Input
          id={`${toolId}-path`}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">{status.statusMessage}</p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onPick(toolId)}
          disabled={busy}
          aria-label="浏览配置文件"
        >
          <FolderOpen aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onSave(toolId, path)}
          disabled={busy || path === status.path}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          保存路径
        </Button>
        {status.pathSource === 'custom' && (
          <Button type="button" variant="ghost" onClick={() => onReset(toolId)} disabled={busy}>
            <RotateCcw aria-hidden="true" />
            移除自定义
          </Button>
        )}
      </div>
    </div>
  )
}

function BackupRow({
  backup,
  pending,
  busy,
  onRestore
}: {
  backup: BackupSummary
  pending: boolean
  busy: boolean
  onRestore: (backupId: string) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{toolNames[backup.toolId]}</span>
          <Badge variant="secondary">{backup.reason === 'apply' ? '应用前' : '恢复前'}</Badge>
          <span className="text-xs text-muted-foreground">{formatDate(backup.createdAt)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={backup.targetPath}>
          {backup.providerName ?? '外部或未匹配配置'} · {backup.targetPath}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" disabled={busy}>
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 aria-hidden="true" />
            )}
            恢复
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Undo2 aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>恢复这份备份？</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere max-h-40 overflow-y-auto">
              {backup.originalFileExisted
                ? `将恢复 ${backup.targetPath}。`
                : `这份备份表示原文件不存在，将删除当前文件 ${backup.targetPath}。`}
              当前状态会先创建一份新的安全备份，操作后请新建或重启会话。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={backup.originalFileExisted ? 'default' : 'destructive'}
              onClick={() => onRestore(backup.id)}
            >
              {backup.originalFileExisted ? '确认恢复' : '确认删除并恢复'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

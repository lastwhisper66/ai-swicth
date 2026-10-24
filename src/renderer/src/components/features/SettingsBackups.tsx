import { useState } from 'react'
import { FolderOpen, HardDrive, RotateCcw, Save, Undo2 } from 'lucide-react'
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle
} from '@renderer/components/ui/item'
import { Spinner } from '@renderer/components/ui/spinner'

interface SettingsBackupsProps {
  section: 'paths' | 'backups'
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
  section,
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
      {section === 'paths' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">配置路径</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              选择 .claude 或 .codex 配置目录，应用会自动管理其中的配置文件。
            </p>
          </div>
          <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border bg-card">
            {(['claude-code', 'codex'] as const).map((toolId) => (
              <ToolPathEditor
                key={`${toolId}:${tools[toolId].directory}`}
                toolId={toolId}
                status={tools[toolId]}
                pending={pendingKey?.startsWith(`path:${toolId}`) ?? false}
                busy={busy}
                onSave={onSavePath}
                onPick={onPickPath}
                onReset={onResetPath}
              />
            ))}
          </ItemGroup>
        </section>
      )}

      {section === 'backups' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">备份记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              应用和恢复前自动创建加密备份，每个工具保留最近 20 份。
            </p>
          </div>
          {backups.length === 0 ? (
            <Empty className="border bg-card py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HardDrive aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>尚无备份记录</EmptyTitle>
                <EmptyDescription>应用供应商配置后，将在这里显示自动创建的备份。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border bg-card">
              {backups.map((backup) => (
                <BackupRow
                  key={backup.id}
                  backup={backup}
                  pending={pendingKey === `restore:${backup.id}`}
                  busy={busy}
                  onRestore={onRestore}
                />
              ))}
            </ItemGroup>
          )}
        </section>
      )}
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
  const [path, setPath] = useState(status.directory)

  return (
    <Item
      role="listitem"
      className="grid gap-4 rounded-none border-0 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
    >
      <ItemHeader className="sm:col-span-2">
        <ItemTitle>{toolNames[toolId]}</ItemTitle>
        <Badge variant="outline">
          {status.pathSource === 'custom'
            ? '自定义路径'
            : status.pathSource === 'environment'
              ? '环境变量'
              : '默认路径'}
        </Badge>
      </ItemHeader>
      <Field className="min-w-0">
        <FieldLabel htmlFor={`${toolId}-path`}>配置目录</FieldLabel>
        <Input
          id={`${toolId}-path`}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          className="font-mono text-xs"
          disabled={busy}
          aria-describedby={`${toolId}-path-description`}
        />
        <FieldDescription
          id={`${toolId}-path-description`}
          className="text-xs leading-5 wrap-anywhere"
        >
          {status.statusMessage}
          <span className="mt-1 block">配置文件：{status.path}</span>
        </FieldDescription>
      </Field>
      <ItemActions className="flex-wrap sm:pt-8">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onPick(toolId)}
          disabled={busy}
          aria-label="浏览配置目录"
        >
          <FolderOpen aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onSave(toolId, path)}
          disabled={busy || path === status.directory}
        >
          {pending ? <Spinner aria-hidden="true" /> : <Save aria-hidden="true" />}
          保存路径
        </Button>
        {status.pathSource === 'custom' && (
          <Button type="button" variant="ghost" onClick={() => onReset(toolId)} disabled={busy}>
            <RotateCcw aria-hidden="true" />
            移除自定义
          </Button>
        )}
      </ItemActions>
    </Item>
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
    <Item role="listitem" className="gap-3 rounded-none border-0 p-4">
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full flex-wrap">
          <span className="font-medium">{toolNames[backup.toolId]}</span>
          <Badge variant="secondary">
            {backup.reason === 'apply'
              ? '应用前'
              : backup.reason === 'common'
                ? '共通配置修改前'
                : '恢复前'}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDate(backup.createdAt)}</span>
        </ItemTitle>
        <ItemDescription className="truncate text-xs" title={backup.targetPath}>
          {backup.providerName ?? '外部或未匹配配置'} · {backup.targetPath}
        </ItemDescription>
        {backup.relatedPaths.length > 0 && (
          <ItemDescription className="truncate text-xs" title={backup.relatedPaths.join('、')}>
            关联文件：{backup.relatedPaths.join('、')}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={busy}>
              {pending ? <Spinner aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
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
                {backup.relatedPaths.length > 0 && '共通模板也会一起恢复到备份时的状态。'}
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
      </ItemActions>
    </Item>
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

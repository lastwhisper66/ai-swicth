import { FileText, FolderInput, FolderOpen, RotateCcw } from 'lucide-react'
import { TOOL_NAMES as toolNames, isWslTool } from '@shared/ipc'
import type { OpenToolLocationInput, ToolId, ToolStatus } from '@shared/ipc'
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle
} from '@renderer/components/ui/item'
import { Spinner } from '@renderer/components/ui/spinner'
import { InstallationBadge, ToolInstallationStatus } from './ToolInstallationStatus'

export function ToolPathSettings({
  toolId,
  status,
  error,
  busy,
  onRetry,
  onPick,
  onReset,
  onOpenLocation
}: {
  toolId: ToolId
  status: ToolStatus | undefined
  error?: string
  busy: boolean
  onRetry: () => void
  onPick: (toolId: ToolId) => void
  onReset: (toolId: ToolId) => void
  onOpenLocation: (input: OpenToolLocationInput) => void
}): React.JSX.Element {
  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h2 className="text-base font-semibold">配置路径</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          点击目录打开文件浏览器，点击文件路径用系统默认编辑器打开。通过“更换目录”选择其他位置。
        </p>
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
        {status ? (
          <ToolPathEditor
            toolId={toolId}
            status={status}
            busy={busy}
            onPick={onPick}
            onReset={onReset}
            onOpenLocation={onOpenLocation}
          />
        ) : (
          <Item>
            <ItemContent>
              <ItemTitle>{toolNames[toolId]}</ItemTitle>
              <ItemDescription>{error ?? '正在确认配置路径与安装状态…'}</ItemDescription>
            </ItemContent>
            <ItemActions>
              {error ? (
                <Button variant="outline" disabled={busy} onClick={onRetry}>
                  重试
                </Button>
              ) : (
                <Spinner />
              )}
            </ItemActions>
          </Item>
        )}
      </div>
    </section>
  )
}
function ToolPathEditor({
  toolId,
  status,
  busy,
  onPick,
  onReset,
  onOpenLocation
}: {
  toolId: ToolId
  status: ToolStatus
  busy: boolean
  onPick: (toolId: ToolId) => void
  onReset: (toolId: ToolId) => void
  onOpenLocation: (input: OpenToolLocationInput) => void
}): React.JSX.Element {
  const showLocation =
    Boolean(status.directory) &&
    (isWslTool(toolId) ||
      status.installation.state === 'installed' ||
      status.fileState !== 'missing' ||
      status.pathSource !== 'default')

  return (
    <Item role="listitem" className="grid min-w-0 gap-4 rounded-none border-0 p-4">
      <ItemHeader>
        <ItemTitle className="flex-wrap">
          {toolNames[toolId]}
          <InstallationBadge installation={status.installation} />
        </ItemTitle>
        <Badge variant="outline">
          {status.pathSource === 'custom'
            ? '自定义路径'
            : status.pathSource === 'environment'
              ? '环境变量'
              : showLocation
                ? '默认路径'
                : '默认路径待确认'}
        </Badge>
      </ItemHeader>
      <ToolInstallationStatus installation={status.installation} showPath />
      {isWslTool(toolId) && (
        <p className="text-xs leading-5 text-muted-foreground">
          自动读取默认 WSL 发行版当前用户的配置。更换发行版时，点击“更换目录”，选择该发行版内的
          .claude 或 .codex 目录，可在目录选择器中输入 \\wsl.localhost 浏览所有发行版。
        </p>
      )}
      {showLocation ? (
        <div className="grid min-w-0 gap-4 rounded-lg bg-muted/35 p-3">
          <ConfigLocation
            label="配置目录"
            path={status.directory}
            toolName={toolNames[toolId]}
            target="directory"
            busy={busy}
            onOpen={() => onOpenLocation({ toolId, target: 'directory' })}
          />
          <ConfigLocation
            label="配置文件"
            path={status.path}
            toolName={toolNames[toolId]}
            target="config"
            busy={busy || status.fileState === 'missing'}
            onOpen={() => onOpenLocation({ toolId, target: 'config' })}
          />
        </div>
      ) : (
        <p className="rounded-lg bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
          尚未确认工具安装，暂不展示推测的默认配置路径。请安装后刷新。
        </p>
      )}
      <ItemActions className="flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPick(toolId)}
          disabled={busy}
          aria-label={`选择 ${toolNames[toolId]} 配置目录`}
        >
          <FolderInput aria-hidden="true" />
          更换目录
        </Button>
        {status.pathSource === 'custom' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={busy}>
                <RotateCcw aria-hidden="true" />
                移除自定义
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <RotateCcw aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>移除 {toolNames[toolId]} 自定义路径？</AlertDialogTitle>
                <AlertDialogDescription>
                  将停止使用当前自定义目录，并重新采用环境变量或工具默认目录。工具配置文件不会被删除。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => onReset(toolId)}>确认移除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </ItemActions>
      <div className="min-w-0 space-y-3 border-t pt-3">
        <p className="text-xs leading-5 wrap-anywhere text-muted-foreground" role="status">
          {status.statusMessage}
        </p>
      </div>
    </Item>
  )
}

function ConfigLocation({
  label,
  path,
  toolName,
  target,
  busy,
  onOpen
}: {
  label: string
  path: string
  toolName: string
  target: OpenToolLocationInput['target']
  busy: boolean
  onOpen: () => void
}): React.JSX.Element {
  const Icon = target === 'directory' ? FolderOpen : FileText
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Button
          type="button"
          variant="link"
          className="block h-auto max-w-full rounded-sm p-0 text-left font-mono text-xs font-normal leading-5 break-all whitespace-normal"
          onClick={onOpen}
          disabled={busy}
          title={`打开 ${path}`}
          aria-label={`打开 ${toolName} ${label}：${path}`}
        >
          {path}
        </Button>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onOpen} disabled={busy}>
        <Icon aria-hidden="true" />
        {target === 'directory' ? '打开目录' : '打开文件'}
      </Button>
    </div>
  )
}

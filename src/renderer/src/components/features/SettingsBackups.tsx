import { FileText, FolderInput, FolderOpen, HardDrive, RotateCcw, Undo2 } from 'lucide-react'
import { TOOL_IDS, TOOL_NAMES as toolNames, isWslTool } from '@shared/ipc'
import type {
  BackupSummary,
  CloudBackupSettings,
  CloudBackupSettingsInput,
  OpenToolLocationInput,
  ToolId,
  ToolStatus
} from '@shared/ipc'
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
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
import { ConfigPreview } from './ConfigPreview'
import { CloudBackupPanel } from './CloudBackupPanel'
import { InstallationBadge, ToolInstallationStatus } from './ToolInstallationStatus'

interface SettingsBackupsProps {
  section: 'paths' | 'backups'
  tools: Record<ToolId, ToolStatus>
  backups: BackupSummary[]
  cloudBackup: CloudBackupSettings
  pendingKey: string | null
  busy: boolean
  onPickPath: (toolId: ToolId) => void
  onResetPath: (toolId: ToolId) => void
  onOpenLocation: (input: OpenToolLocationInput) => void
  onRestore: (backupId: string) => void
  onSaveCloudBackup: (input: CloudBackupSettingsInput) => Promise<boolean>
  onSaveCloudBackupPassword: (password: string) => Promise<boolean>
  onTestCloudBackup: (input: CloudBackupSettingsInput) => void
  onUploadCloudBackup: (password: string) => void
  onRestoreCloudBackup: (password: string) => void
}

export function SettingsBackups({
  section,
  tools,
  backups,
  cloudBackup,
  pendingKey,
  busy,
  onPickPath,
  onResetPath,
  onOpenLocation,
  onRestore,
  onSaveCloudBackup,
  onSaveCloudBackupPassword,
  onTestCloudBackup,
  onUploadCloudBackup,
  onRestoreCloudBackup
}: SettingsBackupsProps): React.JSX.Element {
  return (
    <div className="space-y-8">
      {section === 'paths' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">配置路径</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              检查工具安装状态并管理配置目录。安装或修复工具后，点击顶部刷新按钮重新检测。
            </p>
          </div>
          <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border bg-card">
            {TOOL_IDS.map((toolId) => (
              <ToolPathEditor
                key={`${toolId}:${tools[toolId].directory}`}
                toolId={toolId}
                status={tools[toolId]}
                busy={busy}
                onPick={onPickPath}
                onReset={onResetPath}
                onOpenLocation={onOpenLocation}
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
              应用和恢复前自动创建本地备份，每个工具保留最近 20 份。
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              本地备份正文按普通 JSON 保存，可能包含工具配置中的明文 API
              Key；需要跨机器迁移时请使用上方的加密云端备份。
            </p>
          </div>
          <CloudBackupPanel
            settings={cloudBackup}
            busy={busy}
            pendingKey={pendingKey}
            onSave={onSaveCloudBackup}
            onSavePassword={onSaveCloudBackupPassword}
            onTest={onTestCloudBackup}
            onUpload={onUploadCloudBackup}
            onRestore={onRestoreCloudBackup}
          />
          {backups.length === 0 ? (
            <Empty className="border bg-card py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HardDrive aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>尚无备份记录</EmptyTitle>
                <EmptyDescription>
                  应用供应商配置后，将在这里显示自动创建的本地备份。
                </EmptyDescription>
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
        {showLocation && (
          <ConfigPreview
            key={status.path}
            input={{ toolId }}
            disabled={busy || status.fileState === 'missing'}
          />
        )}
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
              : backup.reason === 'common' || backup.reason === 'template'
                ? '共通配置修改前'
                : '恢复前'}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDate(backup.createdAt)}</span>
        </ItemTitle>
        <ItemDescription className="truncate text-xs" title={backup.targetPath}>
          {backup.reason === 'template' ? '共用模板' : (backup.providerName ?? '外部或未匹配配置')}{' '}
          · {backup.targetPath}
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
                {backup.reason === 'template'
                  ? '将恢复 AI Switch 中的共通模板，本机和 WSL 后续应用供应商时生效。'
                  : backup.originalFileExisted
                    ? `将恢复 ${backup.targetPath}。`
                    : `这份备份表示原文件不存在，将删除当前文件 ${backup.targetPath}。`}
                {backup.relatedPaths.length > 0 &&
                  '相关模板和接管状态也会恢复；共通模板由本机与 WSL 共用，恢复后两边后续应用都会使用该模板。'}
                当前状态会先创建一份新的安全备份。
                {backup.reason !== 'template' && '操作后请新建或重启会话。'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant={backup.originalFileExisted ? 'default' : 'destructive'}
                onClick={() => onRestore(backup.id)}
              >
                {backup.reason === 'template' || backup.originalFileExisted
                  ? '确认恢复'
                  : '确认删除并恢复'}
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

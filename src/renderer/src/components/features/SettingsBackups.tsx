import { HardDrive, Undo2 } from 'lucide-react'
import { TOOL_NAMES as toolNames } from '@shared/ipc'
import type {
  BackupSummary,
  CloudBackupSettings,
  CloudBackupSettingsInput,
  ConfigurationBackupSummary
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
  ItemTitle
} from '@renderer/components/ui/item'
import { Spinner } from '@renderer/components/ui/spinner'
import { CopilotPage } from './CopilotPage'
import { CloudBackupPanel } from './CloudBackupPanel'

interface SettingsBackupsProps {
  backups: BackupSummary[]
  configurationBackups: ConfigurationBackupSummary[]
  onRestoreConfigurationBackup: (backupId: string) => void
  cloudBackup: CloudBackupSettings
  pendingKey: string | null
  busy: boolean
  onRestore: (backupId: string) => void
  onSaveCloudBackup: (input: CloudBackupSettingsInput) => Promise<boolean>
  onSaveCloudBackupPassword: (password: string) => Promise<boolean>
  onTestCloudBackup: (input: CloudBackupSettingsInput) => void
  onUploadCloudBackup: (password: string) => void
  onRestoreCloudBackup: (password: string, objectKey?: string) => void
  onPendingChange: (busy: boolean) => void
}

export function SettingsBackups({
  backups,
  configurationBackups,
  onRestoreConfigurationBackup,
  cloudBackup,
  pendingKey,
  busy,
  onRestore,
  onSaveCloudBackup,
  onSaveCloudBackupPassword,
  onTestCloudBackup,
  onUploadCloudBackup,
  onRestoreCloudBackup,
  onPendingChange
}: SettingsBackupsProps): React.JSX.Element {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">备份记录</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            应用、清理和恢复前自动创建本地备份，每个工具保留最近 20 份。
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
        {configurationBackups.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">覆盖前的本机配置快照</h3>
            <p className="text-xs text-muted-foreground">
              恢复供应商和通用模板，当前配置会先备份；工具文件和本机设置保持不变。
            </p>
            <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border bg-card">
              {configurationBackups.map((backup) => (
                <Item key={backup.id} className="border-0 rounded-none">
                  <ItemContent>
                    <ItemTitle>
                      {formatDate(backup.createdAt)} ·{' '}
                      {backup.reason === 'cloud' ? '应用云端存档前' : '恢复本机快照前'}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" disabled={busy}>
                          恢复配置
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>恢复这份本机配置快照？</AlertDialogTitle>
                          <AlertDialogDescription>
                            会完整覆盖当前供应商和通用模板（含 API
                            Key），不合并当前变更；不会写入工具配置文件。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onRestoreConfigurationBackup(backup.id)}
                          >
                            确认恢复
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        )}
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
        <CopilotPage mode="backups" busy={busy} onBusyChange={onPendingChange} />
      </section>
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
              : backup.reason === 'cleanup'
                ? '清理前'
                : backup.reason === 'common' || backup.reason === 'template'
                  ? '共通配置修改前'
                  : '恢复前'}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDate(backup.createdAt)}</span>
        </ItemTitle>
        <ItemDescription
          className="truncate text-xs"
          title={backup.reason === 'template' ? '应用内共用模板' : backup.targetPath}
        >
          {backup.reason === 'template'
            ? '应用内共用模板'
            : `${backup.reason === 'cleanup' ? '未管理供应商清理' : (backup.providerName ?? '外部或未匹配配置')} · ${backup.targetPath}`}
        </ItemDescription>
        {backup.relatedPaths.length > 0 && (
          <ItemDescription className="truncate text-xs">
            包含关联的共通模板或字段接管状态
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
                  '关联的模板或接管状态也会恢复；若包含共通模板，恢复后本机与 WSL 后续应用都会使用该模板。'}
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

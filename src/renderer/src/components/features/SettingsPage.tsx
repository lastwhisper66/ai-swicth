import { Database, FileCog, HardDrive, Settings, SlidersHorizontal } from 'lucide-react'
import type {
  AppSnapshot,
  AppSettings,
  BackupSummary,
  CloudBackupSettings,
  CloudBackupSettingsInput,
  CloseBehavior,
  OpenToolLocationInput,
  ProviderSummary,
  ToolId,
  ToolStatus
} from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import { ProvidersPage } from './ProvidersPage'
import { SettingsBackups } from './SettingsBackups'
import { CommonConfigPage } from './CommonConfigPage'
import { GeneralSettings } from './GeneralSettings'

export type SettingsSection = 'general' | 'providers' | 'common' | 'paths' | 'backups'

interface SettingsPageProps {
  section: SettingsSection
  settings: AppSettings
  onCloseBehaviorChange: (behavior: CloseBehavior) => void
  onSectionChange: (section: SettingsSection) => void
  providers: ProviderSummary[]
  tools: Record<ToolId, ToolStatus>
  backups: BackupSummary[]
  cloudBackup: CloudBackupSettings
  pendingKey: string | null
  busy: boolean
  providerTool: ToolId
  onProviderToolChange: (toolId: ToolId) => void
  providerEditor: React.ReactNode
  onAddProvider: (toolId: ToolId) => void
  onEditProvider: (provider: ProviderSummary, toolId: ToolId) => void
  onDeleteProvider: (providerId: string) => void
  onPickPath: (toolId: ToolId) => void
  onResetPath: (toolId: ToolId) => void
  onOpenLocation: (input: OpenToolLocationInput) => void
  onRestore: (backupId: string) => void
  onPendingChange: (pending: boolean) => void
  onCommonSaved: (snapshot: AppSnapshot, message: string) => void
  onSaveCloudBackup: (input: CloudBackupSettingsInput) => Promise<boolean>
  onSaveCloudBackupPassword: (password: string) => Promise<boolean>
  onTestCloudBackup: (input: CloudBackupSettingsInput) => void
  onUploadCloudBackup: (password: string) => void
  onRestoreCloudBackup: (password: string) => void
}

const items: Array<{
  id: SettingsSection
  label: string
  description: string
  Icon: typeof Database
}> = [
  { id: 'general', label: '应用设置', description: '设置关闭窗口后的行为', Icon: Settings },
  {
    id: 'providers',
    label: '供应商设置',
    description: '管理名称、地址、Key 与模型',
    Icon: Database
  },
  {
    id: 'common',
    label: '共通配置',
    description: '管理各工具共享的通用设置',
    Icon: SlidersHorizontal
  },
  { id: 'paths', label: '配置路径', description: '设置两个工具的配置目录', Icon: FileCog },
  { id: 'backups', label: '备份与恢复', description: '查看和恢复历史配置', Icon: HardDrive }
]

export function SettingsPage({
  section,
  settings,
  onCloseBehaviorChange,
  onSectionChange,
  providers,
  tools,
  backups,
  cloudBackup,
  pendingKey,
  busy,
  providerTool,
  onProviderToolChange,
  providerEditor,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onPickPath,
  onResetPath,
  onOpenLocation,
  onRestore,
  onPendingChange,
  onCommonSaved,
  onSaveCloudBackup,
  onSaveCloudBackupPassword,
  onTestCloudBackup,
  onUploadCloudBackup,
  onRestoreCloudBackup
}: SettingsPageProps): React.JSX.Element {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-2 lg:sticky lg:top-8 lg:self-start">
        <div className="px-2 pb-1">
          <h2 className="font-semibold">设置</h2>
          <p className="mt-1 text-xs text-muted-foreground">管理应用与本地配置</p>
        </div>
        <nav
          className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
          aria-label="设置分类"
        >
          {items.map(({ id, label, description, Icon }) => (
            <Button
              key={id}
              type="button"
              variant={section === id ? 'secondary' : 'ghost'}
              className="h-10 min-w-max justify-start gap-2 px-3 py-2 text-left lg:h-auto lg:w-full lg:min-w-0 lg:gap-3 lg:py-2.5"
              disabled={busy}
              onClick={() => onSectionChange(id)}
              aria-current={section === id ? 'page' : undefined}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm">{label}</span>
                <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground lg:block">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0">
        {section === 'general' ? (
          <GeneralSettings
            settings={settings}
            busy={busy}
            onCloseBehaviorChange={onCloseBehaviorChange}
          />
        ) : section === 'providers' ? (
          (providerEditor ?? (
            <ProvidersPage
              busy={busy}
              providers={providers}
              tools={tools}
              toolId={providerTool}
              onToolChange={onProviderToolChange}
              onAdd={onAddProvider}
              onEdit={onEditProvider}
              onDelete={onDeleteProvider}
            />
          ))
        ) : section === 'common' ? (
          <CommonConfigPage
            busy={busy}
            providers={providers}
            onPendingChange={onPendingChange}
            onSaved={onCommonSaved}
          />
        ) : (
          <SettingsBackups
            section={section}
            tools={tools}
            backups={backups}
            cloudBackup={cloudBackup}
            pendingKey={pendingKey}
            busy={busy}
            onPickPath={onPickPath}
            onResetPath={onResetPath}
            onOpenLocation={onOpenLocation}
            onRestore={onRestore}
            onSaveCloudBackup={onSaveCloudBackup}
            onSaveCloudBackupPassword={onSaveCloudBackupPassword}
            onTestCloudBackup={onTestCloudBackup}
            onUploadCloudBackup={onUploadCloudBackup}
            onRestoreCloudBackup={onRestoreCloudBackup}
          />
        )}
      </section>
    </div>
  )
}

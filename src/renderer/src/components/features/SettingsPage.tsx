import { Database, FileCog, HardDrive, Info, Settings, SlidersHorizontal } from 'lucide-react'
import type {
  AppInfo,
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
import { AboutSettings } from './AboutSettings'

export type SettingsSection = 'general' | 'providers' | 'common' | 'paths' | 'backups' | 'about'

interface SettingsPageProps {
  section: SettingsSection
  appInfo: AppInfo
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
  { id: 'backups', label: '备份与恢复', description: '查看和恢复历史配置', Icon: HardDrive },
  { id: 'about', label: '关于', description: '查看应用信息与版本', Icon: Info }
]

export function SettingsPage({
  section,
  appInfo,
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
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 space-y-4">
        <div>
          <h2 className="font-semibold">设置</h2>
          <p className="mt-1 text-xs text-muted-foreground">管理应用与本地配置</p>
        </div>
        <nav className="flex flex-wrap gap-1 border-b pb-4" aria-label="设置分类">
          {items.map(({ id, label, description, Icon }) => (
            <Button
              key={id}
              type="button"
              variant={section === id ? 'secondary' : 'ghost'}
              className="h-9 justify-start gap-2 px-3"
              disabled={busy}
              onClick={() => onSectionChange(id)}
              aria-current={section === id ? 'page' : undefined}
              title={description}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </nav>
      </div>

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
        ) : section === 'about' ? (
          <AboutSettings appInfo={appInfo} />
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

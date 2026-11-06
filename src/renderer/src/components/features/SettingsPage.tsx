import { HardDrive, Info, Settings } from 'lucide-react'
import type {
  AppInfo,
  AppSettings,
  BackupSummary,
  CloudBackupSettings,
  CloudBackupSettingsInput,
  ConfigurationBackupSummary,
  CloseBehavior
} from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import { SettingsBackups } from './SettingsBackups'
import { GeneralSettings } from './GeneralSettings'
import { AboutSettings } from './AboutSettings'

export type SettingsSection = 'general' | 'backups' | 'about'

interface SettingsPageProps {
  section: SettingsSection
  appInfo: AppInfo
  settings: AppSettings
  onCloseBehaviorChange: (behavior: CloseBehavior) => void
  onSectionChange: (section: SettingsSection) => void
  backups: BackupSummary[]
  configurationBackups: ConfigurationBackupSummary[]
  cloudBackup: CloudBackupSettings
  pendingKey: string | null
  busy: boolean
  onRestore: (backupId: string) => void
  onPendingChange: (pending: boolean) => void
  onSaveCloudBackup: (input: CloudBackupSettingsInput) => Promise<boolean>
  onSaveCloudBackupPassword: (password: string) => Promise<boolean>
  onTestCloudBackup: (input: CloudBackupSettingsInput) => void
  onUploadCloudBackup: (password: string) => void
  onRestoreCloudBackup: (password: string, objectKey?: string) => void
  onRestoreConfigurationBackup: (backupId: string) => void
}

const items: Array<{
  id: SettingsSection
  label: string
  description: string
  Icon: typeof Settings
}> = [
  { id: 'general', label: '应用设置', description: '设置关闭窗口后的行为', Icon: Settings },
  { id: 'backups', label: '备份与恢复', description: '查看和恢复历史配置', Icon: HardDrive },
  { id: 'about', label: '关于', description: '查看应用信息与版本', Icon: Info }
]

export function SettingsPage({
  section,
  appInfo,
  settings,
  onCloseBehaviorChange,
  onSectionChange,
  backups,
  configurationBackups,
  cloudBackup,
  pendingKey,
  busy,
  onRestore,
  onPendingChange,
  onSaveCloudBackup,
  onSaveCloudBackupPassword,
  onTestCloudBackup,
  onUploadCloudBackup,
  onRestoreCloudBackup,
  onRestoreConfigurationBackup
}: SettingsPageProps): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 space-y-4">
        <div>
          <h2 className="font-semibold">设置</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            管理应用偏好与备份；供应商和功能配置请前往对应工具页面。
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 border-b pb-4" aria-label="设置分类">
          {items.map(({ id, label, description, Icon }) => (
            <Button
              key={id}
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
        ) : section === 'about' ? (
          <AboutSettings appInfo={appInfo} />
        ) : (
          <SettingsBackups
            backups={backups}
            configurationBackups={configurationBackups}
            onRestoreConfigurationBackup={onRestoreConfigurationBackup}
            cloudBackup={cloudBackup}
            pendingKey={pendingKey}
            busy={busy}
            onRestore={onRestore}
            onSaveCloudBackup={onSaveCloudBackup}
            onSaveCloudBackupPassword={onSaveCloudBackupPassword}
            onTestCloudBackup={onTestCloudBackup}
            onUploadCloudBackup={onUploadCloudBackup}
            onRestoreCloudBackup={onRestoreCloudBackup}
            onPendingChange={onPendingChange}
          />
        )}
      </section>
    </div>
  )
}

import { Database, FileCog, HardDrive, SlidersHorizontal } from 'lucide-react'
import type { AppSnapshot, BackupSummary, ProviderSummary, ToolId, ToolStatus } from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import { ProvidersPage } from './ProvidersPage'
import { SettingsBackups } from './SettingsBackups'
import { CommonConfigPage } from './CommonConfigPage'

export type SettingsSection = 'providers' | 'common' | 'paths' | 'backups'

interface SettingsPageProps {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  providers: ProviderSummary[]
  tools: Record<ToolId, ToolStatus>
  backups: BackupSummary[]
  pendingKey: string | null
  busy: boolean
  providerTool: ToolId
  onProviderToolChange: (toolId: ToolId) => void
  providerEditor: React.ReactNode
  onAddProvider: (toolId: ToolId) => void
  onEditProvider: (provider: ProviderSummary, toolId: ToolId) => void
  onDeleteProvider: (providerId: string) => void
  onSavePath: (toolId: ToolId, path: string) => void
  onPickPath: (toolId: ToolId) => void
  onResetPath: (toolId: ToolId) => void
  onRestore: (backupId: string) => void
  onPendingChange: (pending: boolean) => void
  onCommonSaved: (snapshot: AppSnapshot, message: string) => void
}

const items: Array<{
  id: SettingsSection
  label: string
  description: string
  Icon: typeof Database
}> = [
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
  onSectionChange,
  providers,
  tools,
  backups,
  pendingKey,
  busy,
  providerTool,
  onProviderToolChange,
  providerEditor,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onSavePath,
  onPickPath,
  onResetPath,
  onRestore,
  onPendingChange,
  onCommonSaved
}: SettingsPageProps): React.JSX.Element {
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <div className="px-2 pb-1">
          <h2 className="font-semibold">设置</h2>
          <p className="mt-1 text-xs text-muted-foreground">管理应用与本地配置</p>
        </div>
        <nav className="flex gap-2 overflow-x-auto lg:block lg:space-y-1" aria-label="设置分类">
          {items.map(({ id, label, description, Icon }) => (
            <Button
              key={id}
              type="button"
              variant={section === id ? 'secondary' : 'ghost'}
              className="h-auto min-w-max justify-start gap-3 px-3 py-2.5 text-left lg:w-full"
              disabled={busy}
              onClick={() => onSectionChange(id)}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm">{label}</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0">
        {section === 'providers' ? (
          (providerEditor ?? (
            <ProvidersPage
              busy={busy}
              providers={providers}
              toolId={providerTool}
              onToolChange={onProviderToolChange}
              onAdd={onAddProvider}
              onEdit={onEditProvider}
              onDelete={onDeleteProvider}
            />
          ))
        ) : section === 'common' ? (
          <CommonConfigPage busy={busy} onPendingChange={onPendingChange} onSaved={onCommonSaved} />
        ) : (
          <SettingsBackups
            section={section}
            tools={tools}
            backups={backups}
            pendingKey={pendingKey}
            busy={busy}
            onSavePath={onSavePath}
            onPickPath={onPickPath}
            onResetPath={onResetPath}
            onRestore={onRestore}
          />
        )}
      </section>
    </div>
  )
}

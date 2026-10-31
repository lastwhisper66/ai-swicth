import type { ProviderConfigurations, HeaderInput, HeaderValue } from './configuration'
import type { ApplicationId } from './applications'

export const IPC_CHANNELS = {
  getAppInfo: 'app:get-info',
  getSnapshot: 'app:get-snapshot',
  getBootstrap: 'app:get-bootstrap',
  getToolStatus: 'tools:get-status',
  getApplications: 'applications:list',
  getApplicationTasks: 'applications:tasks',
  setApplicationVisibility: 'applications:set-visibility',
  setApplicationOrder: 'applications:set-order',
  setWslLaunchSettings: 'applications:set-wsl-launch',
  startApplicationTask: 'applications:start-task',
  setAppSettings: 'app:set-settings',
  setCloudBackupSettings: 'cloud-backup:set-settings',
  setCloudBackupPassword: 'cloud-backup:set-password',
  getCloudBackupSecret: 'cloud-backup:get-secret',
  testCloudBackup: 'cloud-backup:test',
  uploadCloudBackup: 'cloud-backup:upload',
  restoreCloudBackup: 'cloud-backup:restore',
  listCloudBackups: 'cloud-backup:list',
  restoreConfigurationBackup: 'configurations:restore-backup',
  setNativeTheme: 'app:set-native-theme',
  initializeTheme: 'app:initialize-theme',
  saveTheme: 'app:save-theme',
  getWindowState: 'window:get-state',
  minimizeWindow: 'window:minimize',
  toggleMaximizeWindow: 'window:toggle-maximize',
  closeWindow: 'window:close',
  createProvider: 'providers:create',
  updateProvider: 'providers:update',
  getProviderSecrets: 'providers:get-secrets',
  deleteProvider: 'providers:delete',
  pickToolPath: 'tools:pick-path',
  setToolPath: 'tools:set-path',
  resetToolPath: 'tools:reset-path',
  openToolLocation: 'tools:open-location',
  getCommonConfig: 'config:get-common',
  saveCommonConfig: 'config:save-common',
  migrateCommonConfig: 'config:migrate-common',
  previewConfig: 'config:preview',
  applyProvider: 'switch:apply',
  restoreBackup: 'backups:restore'
} as const

export const WINDOW_STATE_CHANGED = 'window:state-changed'
export const APPLICATION_TASK_CHANGED = 'applications:task-changed'
export const APPLICATION_DETECTED = 'applications:detected'

export interface WindowState {
  isMaximized: boolean
}

export const TOOL_IDS = ['claude-code', 'codex', 'claude-code-wsl', 'codex-wsl'] as const

export type ToolId = (typeof TOOL_IDS)[number]

export const WSL_SHELLS = ['auto', 'bash', 'zsh', 'fish'] as const
export const APPLICATION_ACTIONS = ['install', 'update', 'uninstall', 'check-update'] as const
export type WslShell = (typeof WSL_SHELLS)[number]
export type ApplicationAction = (typeof APPLICATION_ACTIONS)[number]

export interface WslLaunchSettings {
  shell: WslShell
}

export interface ApplicationPreferences {
  visible: Record<ToolId, boolean>
  wsl: Record<string, WslLaunchSettings>
  order: ApplicationId[]
}

export interface SetApplicationOrderInput {
  order: ApplicationId[]
}

export interface SetApplicationVisibilityInput {
  toolId: ToolId
  visible: boolean
}

export interface SetWslLaunchSettingsInput extends WslLaunchSettings {
  applicationId: ApplicationId
}

export interface StartApplicationTaskInput {
  applicationId: ApplicationId
  action: ApplicationAction
}

export interface NpmInstallation {
  available: boolean
  nodeVersion: string | null
  npmVersion: string | null
  prefix: string | null
  packageVersion: string | null
  managed: boolean
  message: string
}

export interface ManagedApplication {
  applicationId: ApplicationId
  installation: ToolInstallation
  npm: NpmInstallation
  distribution: string | null
  distributionLabel: string | null
  user: string | null
  shell: string | null
  launchSettings: WslLaunchSettings
  environmentError: string | null
  latestVersion: string | null
  latestVersionError: string | null
  updateAvailable: boolean
}

export interface DetectApplicationsInput {
  requestId: string
}

export interface ApplicationDetectionResult {
  requestId: string
  application: ManagedApplication
}

export interface ApplicationTask {
  id: string
  applicationId: ApplicationId
  action: ApplicationAction
  state: 'running' | 'succeeded' | 'failed'
  message: string
  log: string[]
  startedAt: string
  finishedAt: string | null
  result: ManagedApplication | null
  /** Persisted sidebar change for this instance after a successful install or uninstall. */
  sidebarVisible: boolean | null
}

export const PROVIDER_TOOL_IDS = ['claude-code', 'codex'] as const

export type ProviderToolId = (typeof PROVIDER_TOOL_IDS)[number]

export const TOOL_NAMES: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'claude-code-wsl': 'Claude Code WSL',
  'codex-wsl': 'Codex WSL'
}

export function isWslTool(toolId: ToolId): boolean {
  return toolId === 'claude-code-wsl' || toolId === 'codex-wsl'
}

export function baseToolId(toolId: ToolId): ProviderToolId {
  return toolId === 'claude-code' || toolId === 'claude-code-wsl' ? 'claude-code' : 'codex'
}

export type ToolModels = Partial<Record<ProviderToolId, string>>

export const CLOUD_BACKUP_RETENTION = { defaultCount: 5, options: [1, 3, 5, 10, 20] } as const

export interface AppInfo {
  name: string
  version: string
}

export type CloseBehavior = 'tray' | 'quit'

export type AppTheme = 'system' | 'light' | 'dark'

export interface SetNativeThemeInput {
  theme: AppTheme
}

export interface CloudBackupSettings {
  enabled: boolean
  endpoint: string
  region: string
  bucket: string
  prefix: string
  retentionCount: number
  accessKeyId: string
  hasSecret: boolean
  maskedSecret: string
  encryptionPassword: string
}

export type CloudSecretUpdate =
  | { mode: 'keep' }
  | { mode: 'clear' }
  | {
      mode: 'replace'
      value: string
    }

export interface CloudBackupSettingsInput {
  enabled: boolean
  endpoint: string
  region: string
  bucket: string
  prefix: string
  retentionCount: number
  accessKeyId: string
  secretAccessKey: CloudSecretUpdate
}

export interface AppSettings {
  closeBehavior: CloseBehavior
  cloudBackup: CloudBackupSettings
}

export interface AppSettingsInput {
  closeBehavior: CloseBehavior
}

export interface ProviderSummary {
  id: string
  name: string
  baseUrl: string
  tools: ProviderToolId[]
  models: ToolModels
  configurations: ProviderConfigurations
  hasApiKey: boolean
  maskedApiKey: string
  createdAt: string
  updatedAt: string
}

export interface CreateProviderInput {
  name: string
  baseUrl: string
  apiKey: string
  tools: ProviderToolId[]
  configurations: ProviderConfigurations<HeaderInput>
}

export type ApiKeyUpdate =
  | { mode: 'keep' }
  | {
      mode: 'replace'
      value: string
    }

export interface UpdateProviderInput {
  id: string
  name: string
  baseUrl: string
  apiKey: ApiKeyUpdate
  tools: ProviderToolId[]
  configurations: ProviderConfigurations<HeaderInput>
}

export interface DeleteProviderInput {
  id: string
}

export interface GetProviderSecretsInput {
  id: string
}

export interface ProviderSecrets {
  apiKey: string
  headers: Partial<Record<ProviderToolId, HeaderValue[]>>
}

export type ToolPathSource = 'default' | 'environment' | 'custom'
export type ToolFileState = 'ready' | 'missing' | 'invalid' | 'unreadable'

export interface ToolInstallation {
  state: 'installed' | 'not-detected' | 'unavailable'
  version: string | null
  executablePath: string | null
  message: string
}

export interface ToolStatus {
  toolId: ToolId
  installation: ToolInstallation
  path: string
  directory: string
  pathSource: ToolPathSource
  fileState: ToolFileState
  statusMessage: string
  currentProviderId: string | null
  currentProviderName: string | null
  currentModelId: string | null
  isExternalConfig: boolean
  baseUrl: string | null
  model: string | null
}

export type BackupReason = 'apply' | 'restore' | 'common' | 'template'

export interface CommonConfigInput {
  toolId: ToolId
  fromCurrent?: boolean
}

export interface CommonConfig {
  toolId: ToolId
  content: string
  source: 'saved' | 'current' | 'empty'
  revision: string
  conflicts: string[]
  warnings: string[]
}

export interface MigrateCommonConfigInput {
  toolId: ToolId
  providerId: string
  modelId: string
  revision: string
}

export interface SaveCommonConfigInput {
  toolId: ToolId
  content: string
  revision: string
}

export interface SaveCommonConfigResult {
  toolId: ProviderToolId
  backupId: string
  message: string
}

export interface PreviewConfigInput {
  toolId: ToolId
  providerId?: string
  draft?: CreateProviderInput | UpdateProviderInput
  modelId?: string
}

export interface ConfigPreview {
  mode: 'current' | 'provider'
  files: Array<{ path: string; content: string | null; language: 'json' | 'toml' }>
  warnings: string[]
}

export interface BackupSummary {
  id: string
  toolId: ToolId
  createdAt: string
  targetPath: string
  providerId: string | null
  providerName: string | null
  reason: BackupReason
  originalFileExisted: boolean
  relatedPaths: string[]
}

export interface AppSnapshot {
  applicationPreferences: ApplicationPreferences
  appInfo: AppInfo
  settings: AppSettings
  providers: ProviderSummary[]
  tools: Record<ToolId, ToolStatus>
  backups: BackupSummary[]
  configurationBackups: ConfigurationBackupSummary[]
}

export type AppBootstrap = Omit<AppSnapshot, 'tools'>

export interface ApplyProviderInput {
  toolId: ToolId
  providerId: string
  modelId?: string
}

export interface ApplyResult {
  toolId: ToolId
  backupId: string
  message: string
  warnings: string[]
  restartRequired: boolean
}

export interface RestoreBackupInput {
  backupId: string
}

export interface RestoreResult {
  toolId: ToolId
  backupId: string
  safetyBackupId: string
  message: string
  restartRequired: boolean
}

export interface CloudBackupOperationInput {
  encryptionPassword: string
  objectKey?: string
}

export interface CloudBackupSummary {
  objectKey: string
  createdAt: string
  current: boolean
}

export interface ConfigurationBackupSummary {
  id: string
  createdAt: string
  reason: 'cloud' | 'restore' | 'migration'
}

export interface CloudBackupOperationResult {
  objectKey: string
  createdAt: string
  providerCount: number
  commonConfigCount: number
  message: string
  warnings: string[]
}

export interface CloudBackupConnectionResult {
  message: string
}

export interface OperationResponse<T> {
  operation: T
  snapshot: AppSnapshot
}

export interface PickToolPathInput {
  toolId: ToolId
}

export interface SetToolPathInput {
  toolId: ToolId
  path: string
}

export interface ResetToolPathInput {
  toolId: ToolId
}

export interface OpenToolLocationInput {
  toolId: ToolId
  target: 'directory' | 'config'
}

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'WSL_UNAVAILABLE'
  | 'DUPLICATE_PROVIDER'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_IN_USE'
  | 'INCOMPATIBLE_PROVIDER'
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'STORAGE_CORRUPTED'
  | 'PATH_NOT_FOUND'
  | 'PARENT_PATH_NOT_FOUND'
  | 'OPEN_FAILED'
  | 'MALFORMED_CONFIG'
  | 'PERMISSION_DENIED'
  | 'CONCURRENT_MODIFICATION'
  | 'BACKUP_NOT_FOUND'
  | 'WRITE_FAILED'
  | 'ROLLBACK_FAILED'
  | 'CLOUD_NOT_CONFIGURED'
  | 'CLOUD_UNAVAILABLE'
  | 'CLOUD_BACKUP_INVALID'
  | 'UNKNOWN'

export interface ApiError {
  code: ApiErrorCode
  message: string
  fieldErrors?: Record<string, string>
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }

export interface DesktopApi {
  getBootstrap: () => Promise<ApiResult<AppBootstrap>>
  getToolStatus: (input: { toolId: ToolId }) => Promise<ApiResult<ToolStatus>>
  getApplications: (input: DetectApplicationsInput) => Promise<ApiResult<ManagedApplication[]>>
  onApplicationDetected: (listener: (result: ApplicationDetectionResult) => void) => () => void
  getApplicationTasks: () => Promise<ApiResult<ApplicationTask[]>>
  setApplicationVisibility: (
    input: SetApplicationVisibilityInput
  ) => Promise<ApiResult<ApplicationPreferences>>
  setApplicationOrder: (
    input: SetApplicationOrderInput
  ) => Promise<ApiResult<ApplicationPreferences>>
  setWslLaunchSettings: (input: SetWslLaunchSettingsInput) => Promise<ApiResult<void>>
  startApplicationTask: (input: StartApplicationTaskInput) => Promise<ApiResult<ApplicationTask>>
  onApplicationTaskChanged: (listener: (task: ApplicationTask) => void) => () => void
  window: {
    getState: () => Promise<ApiResult<WindowState>>
    minimize: () => Promise<ApiResult<void>>
    toggleMaximize: () => Promise<ApiResult<WindowState>>
    close: () => Promise<ApiResult<void>>
    onStateChanged: (listener: (state: WindowState) => void) => () => void
  }
  getAppInfo: () => Promise<AppInfo>
  getSnapshot: () => Promise<ApiResult<AppSnapshot>>
  setAppSettings: (input: AppSettingsInput) => Promise<ApiResult<AppSnapshot>>
  setCloudBackupSettings: (input: CloudBackupSettingsInput) => Promise<ApiResult<AppSnapshot>>
  setCloudBackupPassword: (input: CloudBackupOperationInput) => Promise<ApiResult<AppSnapshot>>
  getCloudBackupSecret: () => Promise<ApiResult<string>>
  testCloudBackup: (
    input: CloudBackupSettingsInput
  ) => Promise<ApiResult<CloudBackupConnectionResult>>
  uploadCloudBackup: (
    input: CloudBackupOperationInput
  ) => Promise<ApiResult<OperationResponse<CloudBackupOperationResult>>>
  restoreCloudBackup: (
    input: CloudBackupOperationInput
  ) => Promise<ApiResult<OperationResponse<CloudBackupOperationResult>>>
  listCloudBackups: () => Promise<ApiResult<CloudBackupSummary[]>>
  restoreConfigurationBackup: (input: RestoreBackupInput) => Promise<ApiResult<AppSnapshot>>
  setNativeTheme: (input: SetNativeThemeInput) => Promise<ApiResult<void>>
  initializeTheme: (input: { legacyTheme?: AppTheme }) => Promise<ApiResult<AppTheme>>
  saveTheme: (input: SetNativeThemeInput) => Promise<ApiResult<void>>
  createProvider: (input: CreateProviderInput) => Promise<ApiResult<AppSnapshot>>
  updateProvider: (input: UpdateProviderInput) => Promise<ApiResult<AppSnapshot>>
  getProviderSecrets: (input: GetProviderSecretsInput) => Promise<ApiResult<ProviderSecrets>>
  deleteProvider: (input: DeleteProviderInput) => Promise<ApiResult<AppSnapshot>>
  pickToolPath: (input: PickToolPathInput) => Promise<ApiResult<string | null>>
  setToolPath: (input: SetToolPathInput) => Promise<ApiResult<AppSnapshot>>
  resetToolPath: (input: ResetToolPathInput) => Promise<ApiResult<AppSnapshot>>
  openToolLocation: (input: OpenToolLocationInput) => Promise<ApiResult<void>>
  getCommonConfig: (input: CommonConfigInput) => Promise<ApiResult<CommonConfig>>
  saveCommonConfig: (
    input: SaveCommonConfigInput
  ) => Promise<ApiResult<OperationResponse<SaveCommonConfigResult>>>
  migrateCommonConfig: (input: MigrateCommonConfigInput) => Promise<ApiResult<AppSnapshot>>
  previewConfig: (input: PreviewConfigInput) => Promise<ApiResult<ConfigPreview>>
  applyProvider: (input: ApplyProviderInput) => Promise<ApiResult<OperationResponse<ApplyResult>>>
  restoreBackup: (input: RestoreBackupInput) => Promise<ApiResult<OperationResponse<RestoreResult>>>
}

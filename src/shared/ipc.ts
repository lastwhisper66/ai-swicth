import type { FieldValue, ProviderConfigurations, HeaderInput, HeaderValue } from './configuration'

export const IPC_CHANNELS = {
  getAppInfo: 'app:get-info',
  getSnapshot: 'app:get-snapshot',
  setAppSettings: 'app:set-settings',
  setCloudBackupSettings: 'cloud-backup:set-settings',
  setCloudBackupPassword: 'cloud-backup:set-password',
  getCloudBackupSecret: 'cloud-backup:get-secret',
  testCloudBackup: 'cloud-backup:test',
  uploadCloudBackup: 'cloud-backup:upload',
  restoreCloudBackup: 'cloud-backup:restore',
  setNativeTheme: 'app:set-native-theme',
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

export interface WindowState {
  isMaximized: boolean
}

export const TOOL_IDS = ['claude-code', 'codex'] as const

export type ToolId = (typeof TOOL_IDS)[number]

export type ToolModels = Partial<Record<ToolId, string>>

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
  tools: ToolId[]
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
  tools: ToolId[]
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
  tools: ToolId[]
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
  headers: Partial<Record<ToolId, HeaderValue[]>>
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
  currentModelName: string | null
  isExternalConfig: boolean
  baseUrl: string | null
  model: string | null
}

export type BackupReason = 'apply' | 'restore' | 'common'

export interface CommonConfigInput {
  toolId: ToolId
  fromCurrent?: boolean
}

export interface CommonConfig {
  toolId: ToolId
  content: string
  templatePath: string
  source: 'saved' | 'current'
  revision: string
  conflicts: string[]
  attributionOriginal?: FieldValue
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
  appInfo: AppInfo
  settings: AppSettings
  providers: ProviderSummary[]
  tools: Record<ToolId, ToolStatus>
  backups: BackupSummary[]
}

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
  setNativeTheme: (input: SetNativeThemeInput) => Promise<ApiResult<void>>
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
  ) => Promise<ApiResult<OperationResponse<ApplyResult>>>
  migrateCommonConfig: (input: MigrateCommonConfigInput) => Promise<ApiResult<AppSnapshot>>
  previewConfig: (input: PreviewConfigInput) => Promise<ApiResult<ConfigPreview>>
  applyProvider: (input: ApplyProviderInput) => Promise<ApiResult<OperationResponse<ApplyResult>>>
  restoreBackup: (input: RestoreBackupInput) => Promise<ApiResult<OperationResponse<RestoreResult>>>
}

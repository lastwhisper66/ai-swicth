export const IPC_CHANNELS = {
  getAppInfo: 'app:get-info',
  getSnapshot: 'app:get-snapshot',
  setAppSettings: 'app:set-settings',
  setNativeTheme: 'app:set-native-theme',
  createProvider: 'providers:create',
  updateProvider: 'providers:update',
  deleteProvider: 'providers:delete',
  pickToolPath: 'tools:pick-path',
  setToolPath: 'tools:set-path',
  resetToolPath: 'tools:reset-path',
  openToolLocation: 'tools:open-location',
  getCommonConfig: 'config:get-common',
  saveCommonConfig: 'config:save-common',
  previewConfig: 'config:preview',
  applyProvider: 'switch:apply',
  restoreBackup: 'backups:restore'
} as const

export const TOOL_IDS = ['claude-code', 'codex'] as const

export type ToolId = (typeof TOOL_IDS)[number]

export type ToolModels = Partial<Record<ToolId, string>>

export interface AppInfo {
  name: string
  version: string
}

export type CloseBehavior = 'tray' | 'quit'

export type AppTheme = 'system' | 'light' | 'dark'

export interface SetNativeThemeInput {
  theme: AppTheme
}

export interface AppSettings {
  closeBehavior: CloseBehavior
}

export interface ProviderSummary {
  id: string
  name: string
  baseUrl: string
  tools: ToolId[]
  models: ToolModels
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
  models: ToolModels
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
  models: ToolModels
}

export interface DeleteProviderInput {
  id: string
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
}

export interface ConfigPreview {
  mode: 'current' | 'provider'
  files: Array<{ path: string; content: string | null; language: 'json' | 'toml' }>
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
  | 'UNKNOWN'

export interface ApiError {
  code: ApiErrorCode
  message: string
  fieldErrors?: Record<string, string>
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }

export interface DesktopApi {
  getAppInfo: () => Promise<AppInfo>
  getSnapshot: () => Promise<ApiResult<AppSnapshot>>
  setAppSettings: (input: AppSettings) => Promise<ApiResult<AppSnapshot>>
  setNativeTheme: (input: SetNativeThemeInput) => Promise<ApiResult<void>>
  createProvider: (input: CreateProviderInput) => Promise<ApiResult<AppSnapshot>>
  updateProvider: (input: UpdateProviderInput) => Promise<ApiResult<AppSnapshot>>
  deleteProvider: (input: DeleteProviderInput) => Promise<ApiResult<AppSnapshot>>
  pickToolPath: (input: PickToolPathInput) => Promise<ApiResult<string | null>>
  setToolPath: (input: SetToolPathInput) => Promise<ApiResult<AppSnapshot>>
  resetToolPath: (input: ResetToolPathInput) => Promise<ApiResult<AppSnapshot>>
  openToolLocation: (input: OpenToolLocationInput) => Promise<ApiResult<void>>
  getCommonConfig: (input: CommonConfigInput) => Promise<ApiResult<CommonConfig>>
  saveCommonConfig: (
    input: SaveCommonConfigInput
  ) => Promise<ApiResult<OperationResponse<ApplyResult>>>
  previewConfig: (input: PreviewConfigInput) => Promise<ApiResult<ConfigPreview>>
  applyProvider: (input: ApplyProviderInput) => Promise<ApiResult<OperationResponse<ApplyResult>>>
  restoreBackup: (input: RestoreBackupInput) => Promise<ApiResult<OperationResponse<RestoreResult>>>
}

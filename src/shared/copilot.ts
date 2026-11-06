import type { ApiResult } from './ipc'
import type { ProviderCleanupPreview } from './provider-cleanup'

export const COPILOT_API_TYPES = ['chat-completions', 'responses', 'messages'] as const
export type CopilotApiType = (typeof COPILOT_API_TYPES)[number]

/** Native Custom Endpoint properties; unknown official options survive form edits. */
export interface CopilotModel {
  id: string
  name: string
  url: string
  apiType: CopilotApiType
  toolCalling: boolean
  vision: boolean
  streaming?: boolean
  thinking?: boolean
  maxInputTokens?: number
  contextWindow?: number
  maxOutputTokens: number
  supportsReasoningEffort?: string[]
  requestHeaders?: Record<string, string>
  [key: string]: unknown
}

export interface CopilotConfiguration {
  name: string
  vendor: 'customendpoint'
  apiKey: string
  models: CopilotModel[]
  [key: string]: unknown
}

export interface CopilotProvider {
  id: string
  configuration: CopilotConfiguration
  createdAt: string
  updatedAt: string
}

export interface CopilotProviderSummary {
  id: string
  name: string
  apiTypes: CopilotApiType[]
  models: Array<{ id: string; name: string; url: string }>
  maskedApiKey: string
  updatedAt: string
  syncState: 'synced' | 'changed' | 'external' | 'missing'
  canDisable: boolean
}

export interface CopilotBackupSummary {
  id: string
  createdAt: string
  path: string
  reason: 'sync' | 'remove' | 'delete' | 'restore' | 'cleanup'
  originalFileExisted: boolean
}

export interface CopilotSnapshot {
  providers: CopilotProviderSummary[]
  path: string
  customPath: boolean
  fileState: 'ready' | 'missing' | 'invalid' | 'unreadable'
  message: string
  revision: string
  backups: CopilotBackupSummary[]
}

export interface SaveCopilotProviderInput {
  id?: string
  revision?: string
  configuration: CopilotConfiguration
}

export interface CopilotApplyInput {
  providerIds: string[]
  revision: string
}

export const COPILOT_CHANNELS = {
  snapshot: 'copilot:snapshot',
  getProvider: 'copilot:get-provider',
  saveProvider: 'copilot:save-provider',
  deleteProvider: 'copilot:delete-provider',
  setProviderOrder: 'copilot:set-order',
  setPath: 'copilot:set-path',
  pickPath: 'copilot:pick-path',
  openLocation: 'copilot:open-location',
  apply: 'copilot:apply',
  cleanup: 'copilot:cleanup',
  previewCleanup: 'copilot:preview-cleanup',
  disable: 'copilot:disable',
  restore: 'copilot:restore'
} as const

export interface CopilotApi {
  snapshot: () => Promise<ApiResult<CopilotSnapshot>>
  getProvider: (input: { id: string }) => Promise<ApiResult<CopilotProvider>>
  saveProvider: (input: SaveCopilotProviderInput) => Promise<ApiResult<void>>
  deleteProvider: (input: { id: string; revision: string }) => Promise<ApiResult<string>>
  setProviderOrder: (input: { order: string[] }) => Promise<ApiResult<CopilotSnapshot>>
  setPath: (input: { directory: string | null }) => Promise<ApiResult<void>>
  pickPath: () => Promise<ApiResult<string | null>>
  openLocation: (input: { target: 'directory' | 'config' }) => Promise<ApiResult<void>>
  apply: (input: CopilotApplyInput) => Promise<ApiResult<string>>
  cleanup: (input: { revision: string }) => Promise<ApiResult<string>>
  previewCleanup: () => Promise<ApiResult<ProviderCleanupPreview>>
  disable: (input: CopilotApplyInput) => Promise<ApiResult<string>>
  restore: (input: { id: string; revision: string }) => Promise<ApiResult<string>>
}

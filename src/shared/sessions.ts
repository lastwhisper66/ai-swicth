import type { ApiResult } from './ipc'

export const SESSION_SOURCES = [
  'claude-code',
  'codex',
  'claude-code-wsl',
  'codex-wsl',
  'copilot-cli',
  'copilot-vscode'
] as const
export type SessionSourceId = (typeof SESSION_SOURCES)[number]
export const SESSION_SOURCE_NAMES: Record<SessionSourceId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'claude-code-wsl': 'Claude Code · WSL',
  'codex-wsl': 'Codex · WSL',
  'copilot-cli': 'Copilot CLI',
  'copilot-vscode': 'VS Code Copilot'
}

export interface SessionSource {
  id: SessionSourceId
  name: string
  directory: string
  directories?: string[]
  distribution?: string
  state: 'ready' | 'missing' | 'error'
  message?: string
}

export interface SessionSummary {
  key: string
  sourceId: SessionSourceId
  sessionId: string
  title: string
  project: string
  updatedAt: string
  createdAt: string
  archived: boolean
  revision: string
}

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  timestamp?: string
  label?: string
}

export interface SessionDetail {
  session: SessionSummary
  messages: SessionMessage[]
  totalMessages: number
  offset: number
  warnings: string[]
}

export type SessionSearchScope = 'all' | 'title' | 'content' | 'id'
export interface SessionQuery {
  sourceId: SessionSourceId
  search: string
  scope: SessionSearchScope
  groupBy: 'time' | 'project'
  project?: string
  since?: string
  offset: number
  limit: number
  refresh?: boolean
}

export interface SessionList {
  source: SessionSource
  sessions: SessionSummary[]
  projects: Array<{ path: string; count: number }>
  total: number
  warnings: string[]
}

export interface SessionDeleteItem {
  key: string
  revision: string
}

export interface SessionDeletePreview {
  token: string
  sessions: SessionSummary[]
  notes: string[]
}

export interface SessionDeleteResult {
  deleted: string[]
  failures: Array<{ key: string; title: string; message: string }>
  warnings: Array<{ key: string; title: string; message: string }>
}

export const SESSION_CHANNELS = {
  list: 'sessions:list',
  read: 'sessions:read',
  selectAll: 'sessions:select-all',
  previewDelete: 'sessions:preview-delete',
  delete: 'sessions:delete'
} as const

export interface SessionsApi {
  list: (input: SessionQuery) => Promise<ApiResult<SessionList>>
  read: (input: {
    key: string
    offset: number
    search?: string
  }) => Promise<ApiResult<SessionDetail>>
  selectAll: (input: SessionQuery) => Promise<ApiResult<SessionSummary[]>>
  previewDelete: (input: {
    sessions: SessionDeleteItem[]
  }) => Promise<ApiResult<SessionDeletePreview>>
  delete: (input: { token: string }) => Promise<ApiResult<SessionDeleteResult>>
}

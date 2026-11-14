import type {
  SessionMessage,
  SessionSource,
  SessionSourceId,
  SessionSummary
} from '@shared/sessions'
import type { AppDatabase } from '../database'
import type { PathSettingsStore } from '../services/path-settings'
import type { WslRuntime } from '../services/wsl-runtime'
import type { NativeSessionRpc } from './native-rpc'

export interface SessionEntry extends SessionSummary {
  source: SessionSource
  file?: string
  fileRevision?: string
  parentId?: string
  fingerprint?: () => Promise<string>
}

export interface SessionContent {
  messages: SessionMessage[]
  warnings: string[]
}

export interface SessionCatalog {
  entries: SessionEntry[]
  warnings: string[]
  canDelete: boolean
}

export interface SessionAdapter {
  directories: (sourceId: SessionSourceId) => Promise<string[]>
  scan: (source: SessionSource, includeEmpty: boolean) => Promise<SessionCatalog>
  read: (entry: SessionEntry) => Promise<SessionContent>
  assertIdle: (entries: SessionEntry[]) => Promise<void>
  remove: (entry: SessionEntry) => Promise<string[]>
  deleteNotes: string[]
  related?: (catalog: SessionEntry[], selected: SessionEntry[]) => SessionEntry[]
  hasSelectedAncestor?: (entry: SessionEntry, selected: SessionEntry[]) => boolean
}

export interface SessionContext {
  database: AppDatabase
  paths: PathSettingsStore
  wsl: WslRuntime
  rpc: <T>(
    kind: 'codex' | 'copilot',
    source: SessionSource,
    operation: (client: NativeSessionRpc) => Promise<T>
  ) => Promise<T>
}

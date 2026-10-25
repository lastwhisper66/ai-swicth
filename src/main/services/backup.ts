import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { BackupReason, BackupSummary, ToolId } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { AppError } from '../errors'
import { hashContent, readOptionalText, writeTextAtomic } from '../utils/files'
import type { CommonConfigStore } from './common-config'
import type { ManagedStateStore } from './managed-state'

const BACKUP_VERSION = 1
const MAX_BACKUPS_PER_TOOL = 20

interface BackupRecord extends BackupSummary {
  checksum: string
  additionalFiles?: BackupFileRecord[]
}

interface BackupFileRecord {
  path: string
  originalFileExisted: boolean
  checksum: string
}

interface BackupIndexDocument {
  version: number
  backups: BackupRecord[]
}

export interface BackupPayload {
  record: BackupRecord
  content: string | null
  additionalContents: Record<string, string | null>
}

export interface CreateBackupInput {
  toolId: ToolId
  targetPath: string
  content: string | null
  additionalFiles?: Array<{ path: string; content: string | null }>
  reason: BackupReason
  providerId: string | null
  providerName: string | null
  protectedBackupId?: string
}

export class BackupService {
  private lock: Promise<void> = Promise.resolve()

  constructor(
    private readonly rootPath: string,
    private readonly commonConfigs: CommonConfigStore,
    private readonly managedStates: ManagedStateStore
  ) {}

  async list(): Promise<BackupSummary[]> {
    return this.withLock(async () => {
      const document = await this.loadIndex()
      return document.backups
        .map((record) => toSummary(this.getRestorableRecord(record)))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    })
  }

  async create(input: CreateBackupInput): Promise<BackupSummary> {
    return this.withLock(async () => {
      if (input.additionalFiles?.some((file) => !this.isRelatedPath(input.toolId, file.path))) {
        throw new AppError('INVALID_INPUT', '备份仅支持工具配置、对应共通模板和接管状态。')
      }
      const document = await this.loadIndex()
      const id = randomUUID()
      const record: BackupRecord = {
        id,
        toolId: input.toolId,
        createdAt: new Date().toISOString(),
        targetPath: input.targetPath,
        providerId: input.providerId,
        providerName: input.providerName,
        reason: input.reason,
        originalFileExisted: input.content !== null,
        relatedPaths: input.additionalFiles?.map((file) => file.path) ?? [],
        checksum: hashContent(input.content),
        additionalFiles: input.additionalFiles?.map((file) => ({
          path: file.path,
          originalFileExisted: file.content !== null,
          checksum: hashContent(file.content)
        }))
      }

      if (input.content !== null || input.additionalFiles?.some((file) => file.content !== null)) {
        const payload = JSON.stringify({
          version: 2,
          content: input.content,
          additionalContents: Object.fromEntries(
            (input.additionalFiles ?? []).map((file) => [file.path, file.content])
          )
        })
        await writeTextAtomic(this.getPayloadPath(record), payload, true)
      }

      document.backups.push(record)
      const removed = pruneBackups(document, input.protectedBackupId)
      try {
        await this.saveIndex(document)
      } catch (error) {
        await unlink(this.getPayloadPath(record)).catch(() => undefined)
        throw error
      }

      await Promise.all(
        removed.map((backup) => unlink(this.getPayloadPath(backup)).catch(() => undefined))
      )
      return toSummary(record)
    })
  }

  async read(backupId: string): Promise<BackupPayload> {
    return this.withLock(async () => {
      const document = await this.loadIndex()
      const record = document.backups.find((backup) => backup.id === backupId)
      if (!record) {
        throw new AppError('BACKUP_NOT_FOUND', '备份不存在，可能已被清理。')
      }

      if (
        !record.originalFileExisted &&
        !(record.additionalFiles ?? []).some((file) => file.originalFileExisted)
      ) {
        return this.getRestorablePayload(record, null, {})
      }
      const storedContent = await readOptionalText(this.getPayloadPath(record))
      if (storedContent === null) {
        throw new AppError('BACKUP_NOT_FOUND', '备份正文不存在，无法恢复。')
      }

      try {
        const payload = parsePayload(storedContent, record)
        if (hashContent(payload.content) !== record.checksum) {
          throw new Error('Checksum mismatch')
        }
        for (const file of record.additionalFiles ?? []) {
          if (hashContent(payload.additionalContents[file.path] ?? null) !== file.checksum) {
            throw new Error('Additional checksum mismatch')
          }
        }
        return this.getRestorablePayload(record, payload.content, payload.additionalContents)
      } catch {
        throw new AppError('STORAGE_CORRUPTED', '备份正文无法读取或校验失败，未修改配置文件。')
      }
    })
  }

  /** Older multi-file backups may include files the application no longer manages. */
  private getRestorableRecord(record: BackupRecord): BackupRecord {
    const additionalFiles = (record.additionalFiles ?? []).filter((file) =>
      this.isRelatedPath(record.toolId, file.path)
    )
    return { ...record, additionalFiles, relatedPaths: additionalFiles.map((file) => file.path) }
  }

  private getRestorablePayload(
    record: BackupRecord,
    content: string | null,
    additionalContents: Record<string, string | null>
  ): BackupPayload {
    const restorable = this.getRestorableRecord(record)
    return {
      record: restorable,
      content,
      additionalContents: Object.fromEntries(
        (restorable.additionalFiles ?? []).map((file) => [
          file.path,
          additionalContents[file.path] ?? null
        ])
      )
    }
  }

  private async loadIndex(): Promise<BackupIndexDocument> {
    const content = await readOptionalText(this.getIndexPath())
    if (content === null) return { version: BACKUP_VERSION, backups: [] }

    try {
      const value: unknown = JSON.parse(content)
      if (!isBackupIndexDocument(value)) throw new Error('Invalid backup index')
      return value
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '备份索引无法读取。原文件未被修改，请检查应用数据目录。'
      )
    }
  }

  private async saveIndex(document: BackupIndexDocument): Promise<void> {
    await writeTextAtomic(this.getIndexPath(), `${JSON.stringify(document, null, 2)}\n`, true)
  }

  private getIndexPath(): string {
    return join(this.rootPath, 'index.v1.json')
  }

  private isRelatedPath(toolId: ToolId, path: string): boolean {
    return (
      path === this.commonConfigs.getPath(toolId) || path === this.managedStates.getPath(toolId)
    )
  }

  private getPayloadPath(record: Pick<BackupRecord, 'id' | 'toolId'>): string {
    return join(this.rootPath, record.toolId, `${record.id}.backup`)
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.lock
    let release: () => void = () => undefined
    this.lock = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

function pruneBackups(document: BackupIndexDocument, protectedBackupId?: string): BackupRecord[] {
  const removed: BackupRecord[] = []
  for (const toolId of TOOL_IDS) {
    const toolBackups = document.backups
      .filter((backup) => backup.toolId === toolId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const candidates = toolBackups.filter((backup) => backup.id !== protectedBackupId)
    const keepCount = protectedBackupId ? MAX_BACKUPS_PER_TOOL - 1 : MAX_BACKUPS_PER_TOOL
    removed.push(...candidates.slice(keepCount))
  }

  const removedIds = new Set(removed.map((backup) => backup.id))
  document.backups = document.backups.filter((backup) => !removedIds.has(backup.id))
  return removed
}

function toSummary(record: BackupRecord): BackupSummary {
  return {
    id: record.id,
    toolId: record.toolId,
    createdAt: record.createdAt,
    targetPath: record.targetPath,
    providerId: record.providerId,
    providerName: record.providerName,
    reason: record.reason,
    originalFileExisted: record.originalFileExisted,
    relatedPaths: record.additionalFiles?.map((file) => file.path) ?? record.relatedPaths ?? []
  }
}

function isBackupIndexDocument(value: unknown): value is BackupIndexDocument {
  if (!isRecord(value) || value.version !== BACKUP_VERSION || !Array.isArray(value.backups)) {
    return false
  }
  return value.backups.every(isBackupRecord)
}

function isBackupRecord(value: unknown): value is BackupRecord {
  if (!isRecord(value)) return false
  return (
    isUuid(value.id) &&
    typeof value.toolId === 'string' &&
    TOOL_IDS.includes(value.toolId as ToolId) &&
    isIsoDate(value.createdAt) &&
    typeof value.targetPath === 'string' &&
    isAbsolute(value.targetPath) &&
    (isUuid(value.providerId) || value.providerId === null) &&
    (typeof value.providerName === 'string' || value.providerName === null) &&
    (value.reason === 'apply' || value.reason === 'restore' || value.reason === 'common') &&
    typeof value.originalFileExisted === 'boolean' &&
    (value.relatedPaths === undefined ||
      (Array.isArray(value.relatedPaths) &&
        value.relatedPaths.every((path) => typeof path === 'string' && isAbsolute(path)))) &&
    typeof value.checksum === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.checksum) &&
    (value.additionalFiles === undefined ||
      (Array.isArray(value.additionalFiles) && value.additionalFiles.every(isBackupFileRecord)))
  )
}

function isBackupFileRecord(value: unknown): value is BackupFileRecord {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    isAbsolute(value.path) &&
    typeof value.originalFileExisted === 'boolean' &&
    typeof value.checksum === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.checksum)
  )
}

function parsePayload(
  decrypted: string,
  record: BackupRecord
): { content: string | null; additionalContents: Record<string, string | null> } {
  try {
    const value: unknown = JSON.parse(decrypted)
    if (isRecord(value) && value.version === 2 && isRecord(value.additionalContents)) {
      if (typeof value.content !== 'string' && value.content !== null)
        throw new Error('Invalid content')
      const additionalContents: Record<string, string | null> = {}
      for (const [path, content] of Object.entries(value.additionalContents)) {
        if (typeof content !== 'string' && content !== null) throw new Error('Invalid content')
        additionalContents[path] = content
      }
      return { content: value.content, additionalContents }
    }
  } catch {
    // Version 1 backups store the encrypted primary file contents directly.
  }

  if (record.additionalFiles?.length) throw new Error('Missing additional contents')
  return { content: decrypted, additionalContents: {} }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && new Date(value).toISOString() === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

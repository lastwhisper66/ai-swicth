import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { BackupReason, BackupSummary, ToolId } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { AppError } from '../errors'
import {
  assertSecureStorageAvailable,
  decryptSecret,
  encryptSecret
} from '../security/secure-storage'
import { hashContent, readOptionalText, writeTextAtomic } from '../utils/files'

const BACKUP_VERSION = 1
const MAX_BACKUPS_PER_TOOL = 20

interface BackupRecord extends BackupSummary {
  checksum: string
}

interface BackupIndexDocument {
  version: number
  backups: BackupRecord[]
}

export interface BackupPayload {
  record: BackupRecord
  content: string | null
}

export interface CreateBackupInput {
  toolId: ToolId
  targetPath: string
  content: string | null
  reason: BackupReason
  providerId: string | null
  providerName: string | null
  protectedBackupId?: string
}

export class BackupService {
  private lock: Promise<void> = Promise.resolve()

  constructor(private readonly rootPath: string) {}

  async list(): Promise<BackupSummary[]> {
    return this.withLock(async () => {
      const document = await this.loadIndex()
      return document.backups
        .map(toSummary)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    })
  }

  async create(input: CreateBackupInput): Promise<BackupSummary> {
    return this.withLock(async () => {
      assertSecureStorageAvailable()
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
        checksum: hashContent(input.content)
      }

      if (input.content !== null) {
        const encryptedContent = encryptSecret(input.content)
        await writeTextAtomic(this.getPayloadPath(record), encryptedContent, true)
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

      if (!record.originalFileExisted) return { record, content: null }
      assertSecureStorageAvailable()
      const encryptedContent = await readOptionalText(this.getPayloadPath(record))
      if (encryptedContent === null) {
        throw new AppError('BACKUP_NOT_FOUND', '备份正文不存在，无法恢复。')
      }

      try {
        const content = decryptSecret(encryptedContent, '备份无法解密或校验失败，未修改配置文件。')
        if (hashContent(content) !== record.checksum) {
          throw new Error('Checksum mismatch')
        }
        return { record, content }
      } catch {
        throw new AppError('STORAGE_CORRUPTED', '备份无法解密或校验失败，未修改配置文件。')
      }
    })
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
    originalFileExisted: record.originalFileExisted
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
    (value.reason === 'apply' || value.reason === 'restore') &&
    typeof value.originalFileExisted === 'boolean' &&
    typeof value.checksum === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.checksum)
  )
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

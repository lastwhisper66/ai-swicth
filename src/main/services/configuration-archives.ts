import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { PROVIDER_TOOL_IDS, type ConfigurationBackupSummary } from '@shared/ipc'
import { isObject } from '@shared/configuration'
import { AppError } from '../errors'
import { hashContent, readOptionalText, writeTextAtomic } from '../utils/files'
import type { AppDatabase } from '../database'

interface ConfigurationArchive extends ConfigurationBackupSummary {
  files: Record<string, string | null>
  checksums: Record<string, string>
}

export class ConfigurationArchiveStore {
  private readonly directory: string

  constructor(private readonly database: AppDatabase) {
    this.directory = join(database.rootPath, 'backups', 'configurations')
  }

  async create(
    files: Record<string, string | null>,
    reason: ConfigurationBackupSummary['reason']
  ): Promise<ConfigurationBackupSummary> {
    const backup = await this.prepare(files, reason)
    this.register(backup)
    return backup
  }

  async prepare(
    files: Record<string, string | null>,
    reason: ConfigurationBackupSummary['reason']
  ): Promise<ConfigurationBackupSummary> {
    const archive: ConfigurationArchive = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      files,
      checksums: Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path, hashContent(content)])
      )
    }
    const text = `${JSON.stringify(archive, null, 2)}\n`
    const path = this.getPath(archive.id)
    await writeTextAtomic(path, text, true)
    if ((await readOptionalText(path)) !== text)
      throw new AppError('WRITE_FAILED', '覆盖前的本机备份校验失败，未覆盖配置。')
    return { id: archive.id, createdAt: archive.createdAt, reason }
  }

  register(backup: ConfigurationBackupSummary): void {
    this.database.putBackup({
      id: backup.id,
      kind: 'configuration',
      createdAt: backup.createdAt,
      toolId: null,
      path: this.getPath(backup.id),
      document: backup
    })
  }

  async list(): Promise<ConfigurationBackupSummary[]> {
    return this.database
      .listBackups('configuration')
      .map((row) => row.document as ConfigurationBackupSummary)
      .filter((summary) => summary.reason !== 'migration')
  }

  async read(id: string): Promise<ConfigurationArchive> {
    // Validate IDs before constructing any filesystem path.
    const path = this.getPath(id)
    if (!this.database.listBackups('configuration').some((row) => row.id === id))
      throw new AppError('BACKUP_NOT_FOUND', '本机配置快照不存在。')
    const content = await readOptionalText(path)
    if (content === null) throw new AppError('BACKUP_NOT_FOUND', '本机配置快照不存在。')
    try {
      const value: unknown = JSON.parse(content)
      if (
        !isObject(value) ||
        value.id !== id ||
        typeof value.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        !['cloud', 'restore', 'migration'].includes(value.reason as string) ||
        !isObject(value.files) ||
        !isObject(value.checksums)
      )
        throw new Error('Invalid configuration archive')
      for (const [path, text] of Object.entries(value.files)) {
        if (
          (text !== null && typeof text !== 'string') ||
          value.checksums[path] !== hashContent(text)
        )
          throw new Error('Invalid configuration checksum')
      }
      return value as unknown as ConfigurationArchive
    } catch {
      throw new AppError('STORAGE_CORRUPTED', '本机配置快照损坏，未修改本地配置。')
    }
  }

  async capturePortable(): Promise<Record<string, string | null>> {
    return this.capturePortableSync()
  }

  capturePortableSync(): Record<string, string | null> {
    return this.database.readTransaction(() => ({
      'providers.json': `${JSON.stringify({ providers: this.database.readProviders() }, null, 2)}\n`,
      ...Object.fromEntries(
        PROVIDER_TOOL_IDS.map((id) => [
          `${id}.common.json`,
          this.database.readRecord(`template:${id}`)
        ])
      )
    }))
  }

  private getPath(id: string): string {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(id))
      throw new AppError('INVALID_INPUT', '无效的本机配置快照标识。')
    return join(this.directory, `${id}.json`)
  }
}

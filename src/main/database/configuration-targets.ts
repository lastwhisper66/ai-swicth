import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { AppDatabase, parseRecordReference } from './index'
import { AppError, isFileSystemError } from '../errors'
import { assertNotSymbolicLink, readOptionalText, writeTextAtomic } from '../utils/files'
import { decodeCommonConfig } from '../services/common-config'
import { ManagedStateStore } from '../services/managed-state'
import { parseConfiguration, isObject } from '@shared/configuration'
import type { ToolId } from '@shared/ipc'

interface PendingOperation {
  files: Array<{ path: string; before: string | null; after: string | null }>
  records: Array<{ reference: string; before: string | null; after: string | null }>
}

/** Explicitly routes application records and external tool files. */
export class ConfigurationTargets {
  constructor(private readonly database: AppDatabase) {}

  async read(target: string): Promise<string | null> {
    if (parseRecordReference(target)) return this.database.readRecord(target)
    if (!isAbsolute(target)) throw new AppError('INVALID_INPUT', '工具配置路径必须为绝对路径。')
    await assertNotSymbolicLink(target)
    return readOptionalText(target)
  }

  async write(target: string, content: string | null, createParent = false): Promise<void> {
    if (parseRecordReference(target)) {
      this.validateRecord(target, content)
      this.database.writeRecord(target, content)
      return
    }
    if (!isAbsolute(target)) throw new AppError('INVALID_INPUT', '工具配置路径必须为绝对路径。')
    await assertNotSymbolicLink(target)
    if (content !== null) await writeTextAtomic(target, content, createParent)
    else
      await unlink(target).catch((error: unknown) => {
        if (!(isFileSystemError(error) && error.code === 'ENOENT')) throw error
      })
  }

  async replace(changes: Record<string, string | null>, createParent = false): Promise<void> {
    const operation: PendingOperation = { files: [], records: [] }
    for (const [target, after] of Object.entries(changes)) {
      const before = await this.read(target)
      if (parseRecordReference(target)) {
        this.validateRecord(target, after)
        operation.records.push({ reference: target, before, after })
      } else operation.files.push({ path: target, before, after })
    }
    // Database-only updates need no external recovery journal.
    if (!operation.files.length) {
      this.database.transaction(() => {
        for (const r of operation.records) this.database.writeRecord(r.reference, r.after)
      })
      return
    }
    if (this.database.sql.prepare('SELECT 1 FROM pending_operations LIMIT 1').get())
      throw new AppError('ROLLBACK_FAILED', '存在尚未恢复的工具写入，请重启应用完成恢复后重试。')
    const id = randomUUID()
    this.database.sql
      .prepare('INSERT INTO pending_operations VALUES (?, ?)')
      .run(id, JSON.stringify(operation))
    try {
      for (const file of operation.files) {
        if ((await this.read(file.path)) !== file.before)
          throw new AppError('CONCURRENT_MODIFICATION', '工具配置已被外部修改，请刷新后重试。')
        await this.write(file.path, file.after, createParent)
        if ((await this.read(file.path)) !== file.after)
          throw new Error('Write verification failed')
      }
      this.database.transaction(() => {
        for (const record of operation.records) {
          if (this.database.readRecord(record.reference) !== record.before)
            throw new AppError('CONCURRENT_MODIFICATION', '应用配置已发生变化，请刷新后重试。')
          this.database.writeRecord(record.reference, record.after)
        }
        this.database.sql.prepare('DELETE FROM pending_operations WHERE id = ?').run(id)
      })
    } catch (error) {
      await this.rollback(id, operation)
      throw error
    }
  }

  async writeSet(
    target: string,
    content: string | null,
    related: Record<string, string | null> = {},
    createParent = false
  ): Promise<void> {
    await this.replace({ [target]: content, ...related }, createParent)
  }

  async recover(): Promise<void> {
    const rows = this.database.sql
      .prepare('SELECT id, document FROM pending_operations')
      .all() as Array<{ id: string; document: string }>
    for (const row of rows) {
      let value: unknown
      try {
        value = JSON.parse(row.document)
      } catch {
        /* Report only the damaged journal, never its contents. */
      }
      if (
        !isObject(value) ||
        !Array.isArray(value.files) ||
        !Array.isArray(value.records) ||
        !value.files.every(
          (f) =>
            isObject(f) &&
            typeof f.path === 'string' &&
            isAbsolute(f.path) &&
            isText(f.before) &&
            isText(f.after)
        ) ||
        !value.records.every(
          (r) =>
            isObject(r) &&
            typeof r.reference === 'string' &&
            parseRecordReference(r.reference) &&
            isText(r.before) &&
            isText(r.after)
        )
      )
        throw new AppError('STORAGE_CORRUPTED', '工具写入恢复记录损坏，请从本机备份恢复后再启动。')
      await this.rollback(row.id, value as unknown as PendingOperation)
    }
  }

  private async rollback(id: string, operation: PendingOperation): Promise<void> {
    try {
      // Check the entire group before restoring; preserve subsequent edits made by the user.
      for (const record of operation.records) {
        this.validateRecord(record.reference, record.before)
        this.validateRecord(record.reference, record.after)
        if (this.database.readRecord(record.reference) !== record.before)
          throw new Error('Application record changed after interrupted write')
      }
      for (const file of operation.files) {
        const current = await this.read(file.path)
        if (current !== file.before && current !== file.after)
          throw new Error('External edit after interrupted write')
      }
      for (const file of operation.files) {
        if ((await this.read(file.path)) !== file.before)
          await this.write(file.path, file.before, true)
        if ((await this.read(file.path)) !== file.before)
          throw new Error('Rollback verification failed')
      }
      this.database.transaction(() => {
        for (const record of operation.records) {
          this.validateRecord(record.reference, record.before)
          this.database.writeRecord(record.reference, record.before)
        }
        this.database.sql.prepare('DELETE FROM pending_operations WHERE id = ?').run(id)
      })
    } catch {
      throw new AppError(
        'ROLLBACK_FAILED',
        '工具写入尚未恢复，配置可能被占用或已被外部修改。请检查工具文件并从本机备份恢复；恢复资料已保留在数据库中。'
      )
    }
  }

  private validateRecord(reference: string, content: string | null): void {
    const target = parseRecordReference(reference)!
    if (target.kind === 'state') ManagedStateStore.decode(content)
    else {
      const template = decodeCommonConfig(content)
      if (template !== null) parseConfiguration(target.toolId as ToolId, template)
    }
  }
}

function isText(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

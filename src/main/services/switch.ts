import { unlink } from 'node:fs/promises'
import type { ApplyResult, RestoreResult, ToolId } from '@shared/ipc'
import type { ToolAdapter } from '../adapters/types'
import { AppError, isFileSystemError } from '../errors'
import type { ProviderStore } from '../providers/store'
import {
  assertNotSymbolicLink,
  hashContent,
  readOptionalText,
  writeTextAtomic
} from '../utils/files'
import type { BackupService } from './backup'
import type { PathSettingsStore } from './path-settings'

export class SwitchService {
  private readonly locks = new Map<ToolId, Promise<void>>()

  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly backupService: BackupService,
    private readonly adapters: Record<ToolId, ToolAdapter>
  ) {}

  async apply(toolId: ToolId, providerId: string): Promise<ApplyResult> {
    return this.withToolLock(toolId, async () => {
      const provider = await this.providerStore.getResolved(providerId)
      const model = provider.models[toolId]
      if (!provider.tools.includes(toolId) || !model) {
        throw new AppError(
          'INCOMPATIBLE_PROVIDER',
          `该供应商未配置 ${this.adapters[toolId].displayName} 所需的模型。`
        )
      }

      const target = await this.pathSettings.get(toolId)
      const adapter = this.adapters[toolId]
      const originalContent = await readTarget(target.path)
      if (originalContent !== null) adapter.parseCurrent(originalContent)
      const originalHash = hashContent(originalContent)
      const configuration = {
        providerId: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        model,
        apiKey: provider.apiKey
      }
      const generated = adapter.generate(originalContent, configuration)
      adapter.verify(generated.content, configuration)

      await assertUnchanged(target.path, originalHash)
      const backup = await this.backupService.create({
        toolId,
        targetPath: target.path,
        content: originalContent,
        reason: 'apply',
        providerId: provider.id,
        providerName: provider.name
      })
      await assertUnchanged(target.path, originalHash)

      try {
        await writeTarget(target.path, generated.content)
        const writtenContent = await readTarget(target.path)
        if (writtenContent === null) throw new Error('Target disappeared after write')
        adapter.verify(writtenContent, configuration)
      } catch (error) {
        if (!(await targetMatches(target.path, originalContent))) {
          await this.rollbackOrThrow(target.path, originalContent)
        }
        throw mapWriteError(error)
      }

      return {
        toolId,
        backupId: backup.id,
        message: `已应用 ${provider.name}，请新建或重启 ${adapter.displayName} 会话。`,
        warnings: generated.warnings,
        restartRequired: true
      }
    })
  }

  async restore(backupId: string): Promise<RestoreResult> {
    const payload = await this.backupService.read(backupId)
    const { record, content: restoredContent } = payload

    return this.withToolLock(record.toolId, async () => {
      const adapter = this.adapters[record.toolId]
      if (restoredContent !== null) adapter.parseCurrent(restoredContent)
      const currentContent = await readTarget(record.targetPath)
      const currentHash = hashContent(currentContent)
      const safetyBackup = await this.backupService.create({
        toolId: record.toolId,
        targetPath: record.targetPath,
        content: currentContent,
        reason: 'restore',
        providerId: null,
        providerName: null,
        protectedBackupId: backupId
      })
      await assertUnchanged(record.targetPath, currentHash)

      try {
        await restoreTarget(record.targetPath, restoredContent)
        const writtenContent = await readTarget(record.targetPath)
        if (hashContent(writtenContent) !== record.checksum) {
          throw new Error('Restored checksum mismatch')
        }
        if (writtenContent !== null) adapter.parseCurrent(writtenContent)
      } catch (error) {
        if (!(await targetMatches(record.targetPath, currentContent))) {
          await this.rollbackOrThrow(record.targetPath, currentContent)
        }
        throw mapWriteError(error)
      }

      return {
        toolId: record.toolId,
        backupId,
        safetyBackupId: safetyBackup.id,
        message: `已恢复 ${adapter.displayName} 配置，请新建或重启会话。`,
        restartRequired: true
      }
    })
  }

  private async rollbackOrThrow(filePath: string, originalContent: string | null): Promise<void> {
    try {
      await restoreTarget(filePath, originalContent)
      const rolledBackContent = await readTarget(filePath)
      if (hashContent(rolledBackContent) !== hashContent(originalContent)) {
        throw new Error('Rollback checksum mismatch')
      }
    } catch {
      throw new AppError('ROLLBACK_FAILED', '配置写入失败且自动回滚未完成。请从备份列表手动恢复。')
    }
  }

  private async withToolLock<T>(toolId: ToolId, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(toolId) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.locks.set(toolId, current)

    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.locks.get(toolId) === current) this.locks.delete(toolId)
    }
  }
}

async function assertUnchanged(filePath: string, expectedHash: string): Promise<void> {
  const currentContent = await readTarget(filePath)
  if (hashContent(currentContent) !== expectedHash) {
    throw new AppError(
      'CONCURRENT_MODIFICATION',
      '配置文件在操作期间被其他程序修改，未写入任何内容。请刷新后重试。'
    )
  }
}

async function readTarget(filePath: string): Promise<string | null> {
  try {
    await assertNotSymbolicLink(filePath)
    return await readOptionalText(filePath)
  } catch (error) {
    if (isFileSystemError(error) && (error.code === 'EACCES' || error.code === 'EPERM')) {
      throw new AppError('PERMISSION_DENIED', '没有权限读取配置文件，请检查文件权限。')
    }
    throw error
  }
}

async function writeTarget(filePath: string, content: string): Promise<void> {
  try {
    await writeTextAtomic(filePath, content)
  } catch (error) {
    throw mapWriteError(error)
  }
}

async function restoreTarget(filePath: string, content: string | null): Promise<void> {
  await assertNotSymbolicLink(filePath)
  if (content !== null) {
    await writeTarget(filePath, content)
    return
  }

  try {
    await unlink(filePath)
  } catch (error) {
    if (!(isFileSystemError(error) && error.code === 'ENOENT')) throw mapWriteError(error)
  }
}

async function targetMatches(filePath: string, content: string | null): Promise<boolean> {
  try {
    return hashContent(await readTarget(filePath)) === hashContent(content)
  } catch {
    return false
  }
}

function mapWriteError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (isFileSystemError(error)) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return new AppError('PERMISSION_DENIED', '没有权限写入配置文件，请检查文件权限。')
    }
    if (error.code === 'ENOENT') {
      return new AppError(
        'PARENT_PATH_NOT_FOUND',
        '配置文件所在目录不存在，请先创建目录或选择其他路径。'
      )
    }
  }

  return new AppError('WRITE_FAILED', '配置文件写入或校验失败，原配置已恢复。')
}

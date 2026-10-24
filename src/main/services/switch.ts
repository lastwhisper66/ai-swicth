import { unlink } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import type {
  ApplyResult,
  CommonConfig,
  CommonConfigInput,
  ConfigPreview,
  PreviewConfigInput,
  SaveCommonConfigInput,
  RestoreResult,
  ToolId
} from '@shared/ipc'
import type { GeneratedToolConfiguration, ToolAdapter } from '../adapters/types'
import { AppError, isFileSystemError } from '../errors'
import type { ProviderStore } from '../providers/store'
import {
  assertNotSymbolicLink,
  hashContent,
  readOptionalText,
  writeTextAtomic
} from '../utils/files'
import type { BackupService, CreateBackupInput } from './backup'
import type { CommonConfigStore } from './common-config'
import { redactConfiguration } from './config-preview'
import type { PathSettingsStore } from './path-settings'

interface ConfigurationWrite extends GeneratedToolConfiguration {
  relatedContents?: Record<string, string>
}

export class SwitchService {
  private readonly locks = new Map<ToolId, Promise<void>>()

  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly backupService: BackupService,
    private readonly adapters: Record<ToolId, ToolAdapter>,
    private readonly commonConfigs: CommonConfigStore
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
      const configuration = {
        providerId: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        model,
        apiKey: provider.apiKey
      }
      const commonPath = this.commonConfigs.getPath(toolId)
      const originalCommon = await readTarget(commonPath)
      const commonContent = this.commonConfigs.decode(originalCommon)
      const sourceContent =
        commonContent === null
          ? originalContent
          : adapter.applyCommon(originalContent, commonContent)
      const generated = adapter.generate(sourceContent, configuration)
      adapter.verify(generated.content, configuration)
      const backupId = await this.writeConfiguration(
        {
          toolId,
          targetPath: target.path,
          content: originalContent,
          additionalFiles: [{ path: commonPath, content: originalCommon }],
          reason: 'apply',
          providerId: provider.id,
          providerName: provider.name
        },
        generated,
        (content) => adapter.verify(content, configuration)
      )

      return {
        toolId,
        backupId,
        message: `已应用 ${provider.name}，请新建或重启 ${adapter.displayName} 会话。`,
        warnings: generated.warnings,
        restartRequired: true
      }
    })
  }

  async getCommonConfig(input: CommonConfigInput): Promise<CommonConfig> {
    const { target, content, template } = await this.readConfiguration(input.toolId)
    const saved = this.commonConfigs.decode(template)
    const useSaved = !input.fromCurrent && saved !== null
    return {
      toolId: input.toolId,
      content: useSaved ? saved : this.adapters[input.toolId].extractCommon(content),
      source: useSaved ? 'saved' : 'current',
      templatePath: this.commonConfigs.getPath(input.toolId),
      revision: configurationRevision(target.path, content, template)
    }
  }

  async saveCommonConfig(input: SaveCommonConfigInput): Promise<ApplyResult> {
    return this.withToolLock(input.toolId, async () => {
      const { target, content, template } = await this.readConfiguration(input.toolId)
      if (configurationRevision(target.path, content, template) !== input.revision) {
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '配置或目录已在编辑期间发生变化。请重新读取共通配置后再保存。'
        )
      }
      const adapter = this.adapters[input.toolId]
      adapter.validateCommon(input.content)
      const current = adapter.parseCurrent(content)
      const merged = adapter.applyCommon(content, input.content)
      const templatePath = this.commonConfigs.getPath(input.toolId)
      const encoded = this.commonConfigs.encode(input.content)
      const backupId = await this.writeConfiguration(
        {
          toolId: input.toolId,
          targetPath: target.path,
          content,
          additionalFiles: [{ path: templatePath, content: template }],
          reason: 'common',
          providerId: null,
          providerName: null
        },
        { content: merged, relatedContents: { [templatePath]: encoded }, warnings: [] },
        (written, writtenRelated) => {
          if (
            !isDeepStrictEqual(adapter.parseCurrent(written), current) ||
            adapter.extractCommon(written) !== adapter.extractCommon(merged) ||
            writtenRelated[templatePath] !== encoded
          ) {
            throw new AppError('WRITE_FAILED', '共通配置写入后校验失败。')
          }
        }
      )
      return {
        toolId: input.toolId,
        backupId,
        message: `共通配置已保存并应用到 ${adapter.displayName}，请新建或重启会话。`,
        warnings: [],
        restartRequired: true
      }
    })
  }

  async previewConfig(input: PreviewConfigInput): Promise<ConfigPreview> {
    const { target, content, template } = await this.readConfiguration(input.toolId)
    const adapter = this.adapters[input.toolId]
    let previewContent = content
    let apiKey: string | null = null
    if (input.providerId || input.draft) {
      const draft = input.draft
      const provider = input.providerId
        ? await this.providerStore.getResolved(input.providerId)
        : draft && 'id' in draft
          ? await this.providerStore.getResolved(draft.id)
          : null
      if (
        (provider && !provider.tools.includes(input.toolId)) ||
        (draft && !draft.tools.includes(input.toolId))
      ) {
        throw new AppError('INCOMPATIBLE_PROVIDER', '该供应商不适用于当前工具。')
      }
      apiKey = draft
        ? typeof draft.apiKey === 'string'
          ? draft.apiKey
          : draft.apiKey.mode === 'replace'
            ? draft.apiKey.value
            : (provider?.apiKey ?? '')
        : (provider?.apiKey ?? '')
      const model = draft?.models[input.toolId] ?? provider?.models[input.toolId] ?? ''
      const baseUrl = draft?.baseUrl ?? provider?.baseUrl ?? ''
      if (!model.trim() || !baseUrl.trim() || !apiKey)
        throw new AppError('INVALID_INPUT', '请先填写 API 地址、模型和 API Key，再查看完整配置。')
      const commonContent = this.commonConfigs.decode(template)
      const sourceContent =
        commonContent === null ? content : adapter.applyCommon(content, commonContent)
      const generated = adapter.generate(sourceContent, {
        providerId: provider?.id ?? 'preview',
        name: draft?.name ?? provider?.name ?? '预览',
        baseUrl,
        model,
        apiKey
      })
      previewContent = generated.content
    } else {
      apiKey = adapter.parseCurrent(content).apiKey
    }
    const secrets = apiKey ? [apiKey] : []
    const previewFiles = [
      {
        path: target.path,
        content: previewContent,
        language: input.toolId === 'codex' ? ('toml' as const) : ('json' as const)
      }
    ]
    return {
      mode: input.providerId || input.draft ? 'provider' : 'current',
      files: previewFiles.map((file) => ({
        ...file,
        content:
          file.content === null
            ? null
            : redactConfiguration(file.content, file.language, input.toolId, secrets)
      }))
    }
  }

  private async readConfiguration(toolId: ToolId): Promise<{
    target: Awaited<ReturnType<PathSettingsStore['get']>>
    content: string | null
    template: string | null
  }> {
    const target = await this.pathSettings.get(toolId)
    const content = await readTarget(target.path)
    const template = await readTarget(this.commonConfigs.getPath(toolId))
    return { target, content, template }
  }

  private async writeConfiguration(
    input: CreateBackupInput,
    generated: ConfigurationWrite,
    verify: (content: string, related: Record<string, string | null>) => void
  ): Promise<string> {
    const originalRelated = Object.fromEntries(
      (input.additionalFiles ?? []).map((file) => [file.path, file.content])
    )
    const paths = Object.keys(originalRelated)
    const hashes = hashTargets(input.targetPath, input.content, originalRelated)
    verify(generated.content, { ...originalRelated, ...generated.relatedContents })
    await assertTargetsUnchanged(hashes)
    const backup = await this.backupService.create(input)
    await assertTargetsUnchanged(hashes)
    try {
      await writeTargetSet(input.targetPath, generated.content, generated.relatedContents)
      const written = await readTarget(input.targetPath)
      if (written === null) throw new Error('Target disappeared after write')
      verify(written, await readTargets(paths))
    } catch (error) {
      if (!(await targetsMatch(input.targetPath, input.content, paths, originalRelated))) {
        await this.rollbackOrThrow([
          { path: input.targetPath, content: input.content },
          ...paths.map((path) => ({ path, content: originalRelated[path] ?? null }))
        ])
      }
      throw mapWriteError(error)
    }
    return backup.id
  }

  async restore(backupId: string): Promise<RestoreResult> {
    const payload = await this.backupService.read(backupId)
    const { record, content: restoredContent, additionalContents } = payload

    return this.withToolLock(record.toolId, async () => {
      const adapter = this.adapters[record.toolId]
      const relatedPaths = (record.additionalFiles ?? []).map((file) => file.path)
      const restoredConfiguration = adapter.parseCurrent(restoredContent)
      const currentContent = await readTarget(record.targetPath)
      const currentRelatedContents = await readTargets(relatedPaths)
      const currentHashes = hashTargets(record.targetPath, currentContent, currentRelatedContents)
      const safetyBackup = await this.backupService.create({
        toolId: record.toolId,
        targetPath: record.targetPath,
        content: currentContent,
        additionalFiles: relatedPaths.map((path) => ({
          path,
          content: currentRelatedContents[path] ?? null
        })),
        reason: 'restore',
        providerId: null,
        providerName: null,
        protectedBackupId: backupId
      })
      await assertTargetsUnchanged(currentHashes)

      try {
        await writeTargetSet(record.targetPath, restoredContent, additionalContents)
        const writtenContent = await readTarget(record.targetPath)
        if (hashContent(writtenContent) !== record.checksum) {
          throw new Error('Restored checksum mismatch')
        }
        const writtenRelatedContents = await readTargets(relatedPaths)
        for (const file of record.additionalFiles ?? []) {
          if (hashContent(writtenRelatedContents[file.path] ?? null) !== file.checksum) {
            throw new Error('Restored related file checksum mismatch')
          }
        }
        if (writtenContent !== null) adapter.parseCurrent(writtenContent)
      } catch (error) {
        if (
          !(await targetsMatch(
            record.targetPath,
            currentContent,
            relatedPaths,
            currentRelatedContents
          ))
        ) {
          await this.rollbackOrThrow([
            { path: record.targetPath, content: currentContent },
            ...relatedPaths.map((path) => ({ path, content: currentRelatedContents[path] ?? null }))
          ])
        }
        throw mapWriteError(error)
      }

      return {
        toolId: record.toolId,
        backupId,
        safetyBackupId: safetyBackup.id,
        message:
          record.toolId === 'codex' && restoredConfiguration.model && !restoredConfiguration.apiKey
            ? '已恢复 Codex 配置。这份备份未在 config.toml 中保存 API Key，请重新应用已保存的供应商，再新建或重启会话。'
            : `已恢复 ${adapter.displayName} 配置，请新建或重启会话。`,
        restartRequired: true
      }
    })
  }

  private async rollbackOrThrow(
    targets: Array<{ path: string; content: string | null }>
  ): Promise<void> {
    try {
      for (const target of targets) {
        if (hashContent(await readTarget(target.path)) !== hashContent(target.content)) {
          await restoreTarget(target.path, target.content)
        }
      }
      for (const target of targets) {
        const rolledBackContent = await readTarget(target.path)
        if (hashContent(rolledBackContent) !== hashContent(target.content)) {
          throw new Error('Rollback checksum mismatch')
        }
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

function configurationRevision(
  path: string,
  content: string | null,
  template: string | null
): string {
  return hashContent(JSON.stringify({ path, content, template }))
}

function hashTargets(
  targetPath: string,
  content: string | null,
  relatedContents: Record<string, string | null>
): Map<string, string> {
  return new Map([
    [targetPath, hashContent(content)],
    ...Object.entries(relatedContents).map(([path, value]) => [path, hashContent(value)] as const)
  ])
}

async function assertTargetsUnchanged(expectedHashes: Map<string, string>): Promise<void> {
  for (const [filePath, expectedHash] of expectedHashes) {
    const currentContent = await readTarget(filePath)
    if (hashContent(currentContent) !== expectedHash) {
      throw new AppError(
        'CONCURRENT_MODIFICATION',
        '配置文件在操作期间被其他程序修改，未写入任何内容。请刷新后重试。'
      )
    }
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

async function writeTargetSet(
  targetPath: string,
  content: string | null,
  relatedContents: Record<string, string | null> | undefined
): Promise<void> {
  if (content === null) await restoreTarget(targetPath, null)
  else await writeTarget(targetPath, content)
  for (const [filePath, relatedContent] of Object.entries(relatedContents ?? {})) {
    await restoreTarget(filePath, relatedContent)
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

async function readTargets(paths: string[]): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    paths.map(async (path) => [path, await readTarget(path)] as const)
  )
  return Object.fromEntries(entries)
}

async function targetsMatch(
  targetPath: string,
  content: string | null,
  relatedPaths: string[],
  relatedContents: Record<string, string | null>
): Promise<boolean> {
  try {
    if (hashContent(await readTarget(targetPath)) !== hashContent(content)) return false
    const currentRelated = await readTargets(relatedPaths)
    return relatedPaths.every(
      (path) =>
        hashContent(currentRelated[path] ?? null) === hashContent(relatedContents[path] ?? null)
    )
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

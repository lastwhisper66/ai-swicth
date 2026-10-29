import { baseToolId, isWslTool } from '@shared/ipc'
import { unlink } from 'node:fs/promises'
import type {
  ApplyResult,
  CommonConfig,
  CommonConfigInput,
  ConfigPreview,
  PreviewConfigInput,
  SaveCommonConfigInput,
  SaveCommonConfigResult,
  MigrateCommonConfigInput,
  RestoreResult,
  ToolId
} from '@shared/ipc'
import type { GeneratedToolConfiguration, ToolAdapter } from '../adapters/types'
import {
  attributionStatus,
  isObject,
  nativeModel,
  parseConfiguration,
  providerOptionPaths,
  readField,
  setField,
  serializeConfiguration,
  type ManagedState
} from '@shared/configuration'
import { toConfigurationInput, validateConfigurations } from '../providers/configuration-validation'
import { AppError, isFileSystemError } from '../errors'
import type { ProviderStore } from '../providers/store'
import {
  assertNotSymbolicLink,
  hashContent,
  readOptionalText,
  writeTextAtomic
} from '../utils/files'
import type { BackupPayload, BackupService, CreateBackupInput } from './backup'
import type { CommonConfigStore } from './common-config'
import { redactConfiguration } from './config-preview'
import type { PathSettingsStore } from './path-settings'
import { ManagedStateStore } from './managed-state'
import { migrateConfiguration } from './configuration-migration'

interface ConfigurationWrite extends GeneratedToolConfiguration {
  relatedContents?: Record<string, string>
  expectedContents?: Record<string, string | null>
}

export class SwitchService {
  private readonly locks = new Map<ToolId, Promise<void>>()

  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly backupService: BackupService,
    private readonly adapters: Record<ToolId, ToolAdapter>,
    private readonly commonConfigs: CommonConfigStore,
    private readonly managedStates: ManagedStateStore
  ) {}

  async apply(toolId: ToolId, providerId: string, modelId?: string): Promise<ApplyResult> {
    return this.withToolLock(toolId, async () => {
      const provider = await this.providerStore.getResolved(providerId)
      const toolConfiguration = provider.configurations[baseToolId(toolId)]
      const preset = toolConfiguration?.models.find(
        (model) => model.id === (modelId ?? toolConfiguration.defaultModelId)
      )
      if (!provider.tools.includes(baseToolId(toolId)) || !toolConfiguration || !preset) {
        throw new AppError(
          'INCOMPATIBLE_PROVIDER',
          `该供应商未配置 ${this.adapters[toolId].displayName} 所需的模型。`
        )
      }

      const target = await this.pathSettings.getAvailable(toolId)
      const adapter = this.adapters[toolId]
      const originalContent = await readTarget(target.path)
      const statePath = this.managedStates.getPath(toolId)
      const originalState = await readTarget(statePath)
      const state = stateForTarget(this.managedStates.decode(originalState), target.path)
      if (originalContent !== null) adapter.parseCurrent(originalContent)
      const configuration = {
        providerId: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        model: nativeModel(toolId, preset),
        apiKey: provider.apiKey,
        preset,
        configuration: toolConfiguration
      }
      const commonPath = this.commonConfigs.getPath(toolId)
      const commonSnapshot = await this.commonConfigs.read(toolId)
      const originalCommon = commonSnapshot.files[commonPath] ?? null
      const commonContent = commonSnapshot.content
      const sourceContent =
        commonContent === null
          ? originalContent
          : applyCommonTemplate(toolId, adapter, originalContent, commonContent, state)
      const generated = adapter.generate(sourceContent, configuration, state.fields)
      const nextState: ManagedState = {
        ...state,
        fields: generated.managedFields ?? [],
        selection: {
          providerId,
          modelId: preset.id,
          signature: hashContent(adapter.providerSignature(generated.content))
        }
      }
      if (commonContent !== null) nextState.common = commonContent
      captureAttribution(toolId, originalContent, commonContent, nextState)
      if (
        baseToolId(toolId) === 'claude-code' &&
        commonContent !== null &&
        attributionStatus(parseConfiguration(toolId, commonContent)) !== 'hidden'
      )
        delete nextState.attribution
      const encodedState = this.managedStates.encode(nextState)
      adapter.verify(generated.content, configuration)
      const backupId = await this.writeConfiguration(
        {
          toolId,
          targetPath: target.path,
          content: originalContent,
          additionalFiles: [
            { path: commonPath, content: originalCommon },
            { path: statePath, content: originalState }
          ],
          reason: 'apply',
          providerId: provider.id,
          providerName: provider.name
        },
        {
          ...generated,
          relatedContents: { [statePath]: encodedState },
          expectedContents: commonSnapshot.files
        },
        (content, related) => {
          adapter.verify(content, configuration)
          if (
            hashContent(content) !== hashContent(generated.content) ||
            related[statePath] !== encodedState
          )
            throw new AppError('WRITE_FAILED', '模型选项或接管状态读回校验失败。')
        }
      )

      return {
        toolId,
        backupId,
        message: `已应用 ${provider.name} / ${preset.name}，请新建或重启 ${adapter.displayName} 会话。`,
        warnings: generated.warnings,
        restartRequired: true
      }
    })
  }

  async getCommonConfig(input: CommonConfigInput): Promise<CommonConfig> {
    const toolId = baseToolId(input.toolId)
    const commonSnapshot = await this.commonConfigs.read(toolId)
    const saved = commonSnapshot.content
    const useSaved = !input.fromCurrent && saved !== null
    let common = saved ?? serializeConfiguration(toolId, {})
    if (input.fromCurrent) {
      const target = await this.pathSettings.getAvailable(toolId)
      common = this.adapters[toolId].extractCommon(await readTarget(target.path))
    }
    const root = parseConfiguration(toolId, common)
    const conflicts = providerOptionPaths(toolId, root).map((path) => path.join('.'))
    // Conflicting legacy headers are moved server-side; masked editor values can never be saved.
    if (conflicts.includes('env.ANTHROPIC_CUSTOM_HEADERS') && isObject(root.env))
      root.env.ANTHROPIC_CUSTOM_HEADERS = '••••••••（迁移时由主进程保留原值）'
    return {
      toolId,
      content: conflicts.includes('env.ANTHROPIC_CUSTOM_HEADERS')
        ? serializeConfiguration(toolId, root)
        : common,
      source: useSaved ? 'saved' : input.fromCurrent ? 'current' : 'empty',
      templatePath: this.commonConfigs.getPath(toolId),
      revision: commonRevision(commonSnapshot.files),
      conflicts,
      warnings: commonSnapshot.warnings
    }
  }

  async saveCommonConfig(input: SaveCommonConfigInput): Promise<SaveCommonConfigResult> {
    return this.withToolLock(input.toolId, async () => {
      const toolId = baseToolId(input.toolId)
      const commonSnapshot = await this.commonConfigs.read(toolId)
      if (commonRevision(commonSnapshot.files) !== input.revision) {
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '共通模板已在编辑期间发生变化。请重新读取后再保存。'
        )
      }
      const adapter = this.adapters[toolId]
      adapter.validateCommon(input.content)
      const previousCommon = commonSnapshot.content ?? serializeConfiguration(toolId, {})
      if (providerOptionPaths(toolId, parseConfiguration(toolId, previousCommon)).length)
        throw new AppError('INVALID_INPUT', '旧共通模板仍包含模型或连接选项，请先迁移归属字段。')
      const templatePath = this.commonConfigs.getPath(toolId)
      const template = commonSnapshot.files[templatePath] ?? null
      const encoded = this.commonConfigs.encode(input.content)
      const hashes = hashTargets(templatePath, template, commonSnapshot.files)
      await assertTargetsUnchanged(hashes)
      const backup = await this.backupService.create({
        toolId,
        targetPath: templatePath,
        content: template,
        reason: 'template',
        providerId: null,
        providerName: null
      })
      await assertTargetsUnchanged(hashes)
      try {
        await writeTextAtomic(templatePath, encoded, true)
        if ((await readTarget(templatePath)) !== encoded)
          throw new AppError('WRITE_FAILED', '共通模板保存后校验失败。')
      } catch (error) {
        await this.rollbackOrThrow([{ path: templatePath, content: template }])
        throw mapWriteError(error)
      }
      return {
        toolId,
        backupId: backup.id,
        message: '共通配置已保存，本机和 WSL 应用供应商时将使用同一份模板。'
      }
    })
  }

  async previewConfig(input: PreviewConfigInput): Promise<ConfigPreview> {
    const { target, content, commonSnapshot, stateContent } = await this.readConfiguration(
      input.toolId
    )
    const adapter = this.adapters[input.toolId]
    let previewContent = content
    let apiKey: string | null = null
    let warnings: string[] = []
    if (input.providerId || input.draft) {
      const provider = input.draft
        ? await this.providerStore.resolveDraft(input.draft)
        : input.providerId
          ? await this.providerStore.getResolved(input.providerId)
          : null
      if (!provider || !provider.tools.includes(baseToolId(input.toolId))) {
        throw new AppError('INCOMPATIBLE_PROVIDER', '该供应商不适用于当前工具。')
      }
      apiKey = provider.apiKey
      const configuration = provider.configurations[baseToolId(input.toolId)]
      const preset = configuration?.models.find(
        (model) => model.id === (input.modelId ?? configuration.defaultModelId)
      )
      if (!configuration || !preset) throw new AppError('INVALID_INPUT', '请先选择已保存的模型。')
      const commonContent = commonSnapshot.content
      const state = stateForTarget(this.managedStates.decode(stateContent), target.path)
      const sourceContent =
        commonContent === null
          ? content
          : applyCommonTemplate(input.toolId, adapter, content, commonContent, state)
      const generated = adapter.generate(
        sourceContent,
        {
          providerId: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          model: nativeModel(input.toolId, preset),
          apiKey,
          preset,
          configuration
        },
        state.fields
      )
      previewContent = generated.content
      warnings = generated.warnings
    } else {
      apiKey = adapter.parseCurrent(content).apiKey
    }
    const secrets = apiKey ? [apiKey] : []
    const previewFiles = [
      {
        path: target.path,
        content: previewContent,
        language: baseToolId(input.toolId) === 'codex' ? ('toml' as const) : ('json' as const)
      }
    ]
    return {
      mode: input.providerId || input.draft ? 'provider' : 'current',
      warnings,
      files: previewFiles.map((file) => ({
        ...file,
        content:
          file.content === null
            ? null
            : redactConfiguration(file.content, file.language, input.toolId, secrets)
      }))
    }
  }

  async migrateCommonConfig(input: MigrateCommonConfigInput): Promise<void> {
    return this.withToolLock(input.toolId, async () => {
      const toolId = baseToolId(input.toolId)
      const commonSnapshot = await this.commonConfigs.read(toolId)
      if (commonRevision(commonSnapshot.files) !== input.revision)
        throw new AppError('CONCURRENT_MODIFICATION', '配置已发生变化，请重新读取后迁移。')
      if (commonSnapshot.content === null)
        throw new AppError('INVALID_INPUT', '只有已保存的旧共通模板需要迁移。')
      const provider = await this.providerStore.getResolved(input.providerId)
      const configuration = provider.configurations[toolId]
      if (!configuration)
        throw new AppError('INCOMPATIBLE_PROVIDER', '请选择适用于此工具的供应商。')
      const migrated = migrateConfiguration(
        toolId,
        commonSnapshot.content,
        configuration,
        input.modelId
      )
      const encodedTemplate = this.commonConfigs.encode(migrated.content)
      const configurations = {
        ...provider.configurations,
        [toolId]: migrated.configuration
      }
      validateConfigurations(configurations, provider.tools, {}, true)
      const previous = await this.providerStore.exportPortable()
      const commonPath = this.commonConfigs.getPath(toolId)
      const template = commonSnapshot.files[commonPath] ?? null
      const hashes = hashTargets(commonPath, template, commonSnapshot.files)
      await assertTargetsUnchanged(hashes)
      await this.backupService.create({
        toolId,
        targetPath: commonPath,
        content: template,
        reason: 'template',
        providerId: provider.id,
        providerName: provider.name
      })
      await assertTargetsUnchanged(hashes)
      let templateWritten = false
      try {
        await this.providerStore.update({
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          tools: provider.tools,
          apiKey: { mode: 'keep' },
          configurations: toConfigurationInput(configurations)
        })
        await assertTargetsUnchanged(hashes)
        await writeTextAtomic(commonPath, encodedTemplate, true)
        templateWritten = true
        if ((await readTarget(commonPath)) !== encodedTemplate)
          throw new AppError('WRITE_FAILED', '迁移后的共通模板读回校验失败。')
      } catch (error) {
        try {
          await this.providerStore.importPortable(previous)
          if (templateWritten) await restoreTarget(commonPath, template)
        } catch {
          throw new AppError(
            'ROLLBACK_FAILED',
            '迁移失败且供应商库回滚未完成，请检查应用数据目录。'
          )
        }
        throw error
      }
    })
  }

  private async readConfiguration(toolId: ToolId): Promise<{
    target: Awaited<ReturnType<PathSettingsStore['get']>>
    content: string | null
    commonSnapshot: Awaited<ReturnType<CommonConfigStore['read']>>
    stateContent: string | null
  }> {
    const target = await this.pathSettings.getAvailable(toolId)
    const content = await readTarget(target.path)
    const commonSnapshot = await this.commonConfigs.read(toolId)
    const stateContent = await readTarget(this.managedStates.getPath(toolId))
    return { target, content, commonSnapshot, stateContent }
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
    const hashes = hashTargets(input.targetPath, input.content, {
      ...generated.expectedContents,
      ...originalRelated
    })
    verify(generated.content, { ...originalRelated, ...generated.relatedContents })
    await assertTargetsUnchanged(hashes)
    const backup = await this.backupService.create(input)
    await assertTargetsUnchanged(hashes)
    try {
      await writeTargetSet(
        input.targetPath,
        generated.content,
        generated.relatedContents,
        isWslTool(input.toolId)
      )
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
    if (payload.record.reason === 'template') return this.restoreCommonTemplate(payload)
    const { record, content: restoredContent, additionalContents } = payload
    await this.pathSettings.checkBackupTarget(record.toolId, record.targetPath)
    const restoredStatePath = this.managedStates.getPath(record.toolId)
    this.managedStates.decode(additionalContents[restoredStatePath] ?? null)
    const restoredTemplate = additionalContents[this.commonConfigs.getPath(record.toolId)]
    if (restoredTemplate !== undefined && restoredTemplate !== null) {
      const common = this.commonConfigs.decode(restoredTemplate)
      if (common !== null) parseConfiguration(record.toolId, common)
    }
    // Backups made before ownership tracking must clear newer tracking, too.
    if (!(record.additionalFiles ?? []).some((file) => file.path === restoredStatePath)) {
      record.additionalFiles = [
        ...(record.additionalFiles ?? []),
        { path: restoredStatePath, originalFileExisted: false, checksum: hashContent(null) }
      ]
      additionalContents[restoredStatePath] = null
    }

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
        await writeTargetSet(
          record.targetPath,
          restoredContent,
          additionalContents,
          isWslTool(record.toolId)
        )
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
          baseToolId(record.toolId) === 'codex' &&
          restoredConfiguration.model &&
          !restoredConfiguration.apiKey
            ? '已恢复 Codex 配置。这份备份未在 config.toml 中保存 API Key，请重新应用已保存的供应商，再新建或重启会话。'
            : `已恢复 ${adapter.displayName} 配置，请新建或重启会话。`,
        restartRequired: true
      }
    })
  }

  private async restoreCommonTemplate(payload: BackupPayload): Promise<RestoreResult> {
    const { record, content } = payload
    const toolId = baseToolId(record.toolId)
    const path = this.commonConfigs.getPath(toolId)
    if (record.targetPath !== path || Object.keys(payload.additionalContents).length)
      throw new AppError('STORAGE_CORRUPTED', '共通模板备份路径无效，未修改任何文件。')
    const common = this.commonConfigs.decode(content)
    if (common !== null) parseConfiguration(toolId, common)
    return this.withToolLock(toolId, async () => {
      const previous = await readTarget(path)
      const hashes = hashTargets(path, previous, {})
      const safetyBackup = await this.backupService.create({
        toolId,
        targetPath: path,
        content: previous,
        reason: 'template',
        providerId: null,
        providerName: null,
        protectedBackupId: record.id
      })
      await assertTargetsUnchanged(hashes)
      try {
        await restoreTarget(path, content)
        if (hashContent(await readTarget(path)) !== record.checksum)
          throw new AppError('WRITE_FAILED', '共通模板恢复后校验失败。')
      } catch (error) {
        await this.rollbackOrThrow([{ path, content: previous }])
        throw mapWriteError(error)
      }
      return {
        toolId,
        backupId: record.id,
        safetyBackupId: safetyBackup.id,
        message: '共通模板已恢复，本机和 WSL 后续应用供应商时生效。',
        restartRequired: false
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
    const family = baseToolId(toolId)
    const previous = this.locks.get(family) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.locks.set(family, current)

    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.locks.get(family) === current) this.locks.delete(family)
    }
  }
}

function commonRevision(files: Record<string, string | null>): string {
  return hashContent(JSON.stringify(files))
}

function applyCommonTemplate(
  toolId: ToolId,
  adapter: ToolAdapter,
  content: string | null,
  common: string,
  state: ManagedState
): string {
  const merged = adapter.applyCommon(content, common, state.common)
  if (baseToolId(toolId) !== 'claude-code' || !state.attribution) return merged
  const template = parseConfiguration(toolId, common)
  const current = parseConfiguration(toolId, content ?? '{}')
  if (template.attribution !== undefined || attributionStatus(current) !== 'hidden') return merged
  const root = parseConfiguration(toolId, merged)
  const before = state.attribution
  if (before.exists && !isObject(before.value)) setField(root, ['attribution'], before.value)
  else {
    for (const key of ['commit', 'pr', 'sessionUrl'])
      setField(root, ['attribution', key], isObject(before.value) ? before.value[key] : undefined)
  }
  return serializeConfiguration(toolId, root)
}

function stateForTarget(state: ManagedState | null, path: string): ManagedState {
  return state?.targetPath === path ? state : { version: 1, targetPath: path, fields: [] }
}

function captureAttribution(
  toolId: ToolId,
  original: string | null,
  common: string | null,
  state: ManagedState
): void {
  if (baseToolId(toolId) !== 'claude-code' || common === null || state.attribution !== undefined)
    return
  if (attributionStatus(parseConfiguration(toolId, common)) === 'hidden')
    state.attribution = structuredClone(
      readField(parseConfiguration(toolId, original ?? '{}'), ['attribution'])
    )
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

async function writeTarget(filePath: string, content: string, createParent = false): Promise<void> {
  try {
    await writeTextAtomic(filePath, content, createParent)
  } catch (error) {
    throw mapWriteError(error)
  }
}

async function writeTargetSet(
  targetPath: string,
  content: string | null,
  relatedContents: Record<string, string | null> | undefined,
  createParent = false
): Promise<void> {
  if (content === null) await restoreTarget(targetPath, null)
  else await writeTarget(targetPath, content, createParent)
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

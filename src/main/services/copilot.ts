import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { isObject } from '@shared/configuration'
import type {
  CopilotBackupSummary,
  CopilotApplyInput,
  CopilotConfiguration,
  CopilotProvider,
  CopilotSnapshot
} from '@shared/copilot'
import { CopilotProviderStore } from '../providers/copilot'
import {
  buildCopilotClientConfiguration,
  copilotClientName,
  copilotGroupIndex,
  copilotProviderName,
  parseCopilotDocument,
  renameCopilotGroup,
  updateCopilotGroup
} from '../adapters/copilot'
import type { AppDatabase } from '../database'
import type { ConfigurationTargets } from '../database/configuration-targets'
import { AppError, toApiError } from '../errors'
import { hashContent } from '../utils/files'
import { maskApiKey } from '../utils/api-key'
import { redactCleanupValue } from '../utils/cleanup-preview'
import type { ProviderCleanupPreview } from '@shared/provider-cleanup'

interface OwnedGroup {
  // The application name stays unprefixed; applied.name is the exact name written to VS Code.
  desired: CopilotConfiguration
  applied: Record<string, unknown>
}
type ManagedGroups = Record<string, OwnedGroup>
interface CopilotBackup extends CopilotBackupSummary {
  content: string | null
  checksum: string
  managed: ManagedGroups
}

interface CopilotFileChange {
  path: string
  original: string | null
  next: string | null
  managed: ManagedGroups
}

interface CopilotCleanupPlan {
  path: string
  original: string | null
  next: string | null
  managed: ManagedGroups
  count: number
  metadataChanged: boolean
  revision: string
  removedGroups: { index: number; group: unknown }[]
}

export class CopilotService {
  readonly providers: CopilotProviderStore
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly database: AppDatabase,
    private readonly targets: ConfigurationTargets
  ) {
    this.providers = new CopilotProviderStore(database)
  }

  /** Serialize requests without coupling BYOK to CLI provider switching. */
  exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.lock.then(operation)
    this.lock = result.catch(() => undefined)
    return result
  }

  getPath(): string {
    return (
      this.database.getSetting<string>('device_settings', 'copilot.path') ?? defaultCopilotPath()
    )
  }

  async setPath(directory: string | null): Promise<void> {
    if (directory === null) {
      this.database.sql.prepare('DELETE FROM device_settings WHERE key = ?').run('copilot.path')
      return
    }
    if (!isAbsolute(directory) || /[\r\n\0]/u.test(directory) || directory.length > 32_000)
      throw new AppError('INVALID_INPUT', '请选择 VS Code 用户配置的绝对目录。')
    try {
      if (!(await stat(directory)).isDirectory())
        throw new AppError('INVALID_INPUT', '请选择目录，而不是文件。')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        throw new AppError(
          'PATH_NOT_FOUND',
          '配置目录不存在，请先创建目录或选择已有 Profile 目录。'
        )
      throw error
    }
    this.database.setSetting(
      'device_settings',
      'copilot.path',
      join(resolve(directory), 'chatLanguageModels.json')
    )
  }

  async pickerDirectory(): Promise<string> {
    let path = dirname(this.getPath())
    while (true) {
      try {
        if ((await stat(path)).isDirectory()) return path
      } catch {
        /* Try the nearest existing parent. */
      }
      const parent = dirname(path)
      if (parent === path) return homedir()
      path = parent
    }
  }

  async snapshot(): Promise<CopilotSnapshot> {
    const path = this.getPath()
    let original: string | null = null
    let groups: unknown[] = []
    let fileState: CopilotSnapshot['fileState'] = 'ready'
    let message = '应用供应商后，请在 VS Code 的聊天模型选择器中选择模型；未出现时重启 VS Code。'
    try {
      original = await this.targets.read(path)
      groups = parseCopilotDocument(original)
      if (original === null) {
        fileState = 'missing'
        message = '配置文件尚不存在，首次应用时创建；请确认目录属于目标 VS Code Profile。'
      }
    } catch (error) {
      const mapped = toApiError(error)
      fileState = mapped.code === 'MALFORMED_CONFIG' ? 'invalid' : 'unreadable'
      message = mapped.message
    }
    const managed = this.managed(path)
    const providers = this.providers.list()
    const readName = groupNameReader(providers, managed)
    return {
      path,
      customPath: this.database.getSetting('device_settings', 'copilot.path') !== null,
      fileState,
      message,
      revision: this.revision(path, original),
      providers: providers.map((provider, position) => {
        const config = provider.configuration
        const clientConfig = buildCopilotClientConfiguration(
          config,
          copilotClientName(config.name, position, providers.length)
        )
        const owned = managed[provider.id]
        const matches = groups.filter((g) => readName(g) === (owned?.desired.name ?? config.name))
        const syncState =
          fileState === 'invalid' || fileState === 'unreadable' || matches.length > 1
            ? 'external'
            : matches.length === 0
              ? 'missing'
              : !owned || !isDeepStrictEqual(matches[0], owned.applied)
                ? 'external'
                : isDeepStrictEqual(config, owned.desired) &&
                    Object.entries(clientConfig).every(([key, value]) =>
                      isDeepStrictEqual(owned.applied[key], value)
                    ) &&
                    owned.applied.apiKey === clientConfig.apiKey
                  ? 'synced'
                  : 'changed'
        return {
          id: provider.id,
          name: config.name,
          apiTypes: [...new Set(config.models.map((model) => model.apiType))],
          models: config.models.map((model) => ({
            id: model.id,
            name: model.name,
            url: safeUrl(model.url)
          })),
          maskedApiKey: maskApiKey(config.apiKey),
          updatedAt: provider.updatedAt,
          syncState,
          canDisable: Boolean(owned)
        }
      }),
      backups: this.backups().map(({ id, createdAt, path, reason, originalFileExisted }) => ({
        id,
        createdAt,
        path,
        reason,
        originalFileExisted
      }))
    }
  }

  async apply(input: CopilotApplyInput): Promise<string> {
    const plan = await this.plan(input.providerIds)
    if (input.revision !== plan.revision)
      throw new AppError('CONCURRENT_MODIFICATION', '配置或供应商已改变，请刷新页面后重新应用。')
    if (plan.next === plan.original) {
      this.saveManaged(plan.path, plan.managed)
      return '所选供应商已应用，无需重复写入。'
    }
    await this.write(plan.path, plan.original, plan.next, plan.managed, 'sync', {
      revision: input.revision
    })
    return `已应用 ${input.providerIds.length} 个供应商，并同步已管理分组的排序编号。请在 VS Code 中选择模型；顺序未更新时执行“开发人员: 重新加载窗口”。`
  }

  async deleteProvider(id: string, revision: string): Promise<string> {
    this.providers.get(id)
    const path = this.getPath()
    const original = await this.targets.read(path)
    this.assertRevision(path, original, revision)
    const rows = this.database.sql
      .prepare("SELECT key, value FROM device_settings WHERE key LIKE 'copilot.managed:%'")
      .all() as Array<{ key: string; value: string }>
    const changes: CopilotFileChange[] = []
    for (const row of rows) {
      if (!Object.hasOwn(JSON.parse(row.value), id)) continue
      const target =
        row.key === this.managedKey(path) ? path : row.key.slice('copilot.managed:'.length)
      changes.push(await this.planDisable(target, [id]))
    }
    const commit = (): void => {
      this.assertRevision(path, original, revision)
      this.providers.delete(id)
    }
    if (changes.length) await this.writeChanges(changes, 'delete', { commit })
    else this.database.transaction(commit)
    return '已删除供应商，并从所有已应用的 VS Code 配置路径移除其配置。'
  }

  async disable(input: CopilotApplyInput): Promise<string> {
    this.validateProviderIds(input.providerIds)
    const path = this.getPath()
    const change = await this.planDisable(path, input.providerIds)
    this.assertRevision(path, change.original, input.revision)
    const count = input.providerIds.filter((id) => Object.hasOwn(this.managed(path), id)).length
    if (!count) return '所选供应商均未应用，无需禁用。'
    await this.writeChanges([change], 'remove', {
      commit: () => this.assertRevision(path, change.original, input.revision)
    })
    return `已禁用 ${count} 个供应商，已移除当前 VS Code 配置中的对应分组，应用内记录仍保留。`
  }

  private async planDisable(path: string, providerIds: string[]): Promise<CopilotFileChange> {
    const original = await this.targets.read(path)
    const managed = this.managed(path)
    const readName = groupNameReader(this.providers.list(), managed)
    let next = original
    parseCopilotDocument(original)
    for (const id of providerIds) {
      const owned = managed[id]
      if (!owned) continue
      const groups = parseCopilotDocument(next)
      const matching = groups.flatMap((group, index) =>
        readName(group) === owned.desired.name ? [index] : []
      )
      const index = matching[0] ?? -1
      if (matching.length > 1 || (index >= 0 && !isDeepStrictEqual(groups[index], owned.applied)))
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '供应商分组已在 VS Code 中修改，未移除。请先在对应配置路径中处理该分组，再刷新重试。'
        )
      delete managed[id]
      if (index >= 0) next = updateCopilotGroup(next, index, undefined)
    }
    return { path, original, next, managed }
  }

  async restore(id: string, revision: string): Promise<string> {
    const backup = this.backups().find((item) => item.id === id)
    if (!backup) throw new AppError('BACKUP_NOT_FOUND', 'Copilot 备份不存在，请刷新列表。')
    const path = this.getPath()
    if (backup.path !== path)
      throw new AppError('INVALID_INPUT', '备份属于其他配置路径，请先切换到备份所示目录再恢复。')
    if (backup.checksum !== hashContent(backup.content))
      throw new AppError('STORAGE_CORRUPTED', 'Copilot 备份校验失败，未修改文件。')
    const original = await this.targets.read(path)
    this.assertRevision(path, original, revision)
    // Restore the original bytes, including a damaged document backed up before an earlier restore.
    await this.write(path, original, backup.content, backup.managed, 'restore', { protectedId: id })
    return '已恢复 Copilot 配置，并保留恢复前的安全备份。必要时重启 VS Code。'
  }

  async previewCleanup(): Promise<ProviderCleanupPreview> {
    const plan = await this.planCleanup()
    return {
      path: plan.path,
      language: 'json',
      revision: plan.revision,
      entries: plan.removedGroups.map(({ index, group }) => {
        const redacted = redactCleanupValue(group) as Record<string, unknown>
        return {
          label: typeof redacted.name === 'string' ? redacted.name : '未命名供应商',
          location: `第 ${index + 1} 个分组 · 数组索引 [${index}]`,
          content: JSON.stringify(redacted, null, 2)
        }
      }),
      hasChanges: plan.count > 0 || plan.metadataChanged,
      notes: plan.metadataChanged ? ['同时整理失效或需重新关联的供应商同步记录。'] : [],
      warnings: []
    }
  }

  async cleanup(revision: string): Promise<string> {
    const plan = await this.planCleanup()
    if (revision !== plan.revision)
      throw new AppError(
        'CONCURRENT_MODIFICATION',
        '清理预览已过期，配置或供应商已改变，请重新预览后确认。'
      )
    if (!plan.count && !plan.metadataChanged) return '没有需要清理的未管理供应商。'
    await this.write(plan.path, plan.original, plan.next, plan.managed, 'cleanup', { revision })
    return plan.count
      ? `已清理 ${plan.count} 个未管理供应商分组，并保留清理前的备份。必要时重启 VS Code。`
      : '已整理失效的同步记录，现有供应商分组保持不变，并保留整理前的备份。'
  }

  private async planCleanup(): Promise<CopilotCleanupPlan> {
    const path = this.getPath()
    const original = await this.targets.read(path)
    const groups = parseCopilotDocument(original)
    const providers = this.providers.list()
    const activeIds = new Set(providers.map((provider) => provider.id))
    const previous = this.managed(path)
    const readName = groupNameReader(providers, previous)
    const managed: ManagedGroups = Object.fromEntries(
      Object.entries(previous).filter(([id]) => activeIds.has(id))
    )

    // A restored provider can have a new ID. Reconnect only an unchanged, unambiguous group.
    for (const provider of providers) {
      if (managed[provider.id]) continue
      const config = provider.configuration
      const candidates = Object.entries(previous).filter(
        ([id, owned]) =>
          !activeIds.has(id) &&
          owned.desired.name === config.name &&
          owned.desired.vendor === config.vendor
      )
      const matches = groups.filter((group) => readName(group) === config.name)
      if (
        candidates.length === 1 &&
        matches.length === 1 &&
        isDeepStrictEqual(matches[0], candidates[0][1].applied)
      )
        managed[provider.id] = candidates[0][1]
    }

    const names = new Set(
      providers.flatMap((provider) => [
        provider.configuration.name,
        ...(managed[provider.id] ? [managed[provider.id].desired.name] : [])
      ])
    )
    const retained = groups.map((group) => {
      const name = readName(group)
      return name !== undefined && names.has(name)
    })
    const count = retained.filter((keep) => !keep).length
    let next = original
    // Remove from the end so array offsets remain valid and retained groups keep their JSONC.
    for (let index = groups.length - 1; index >= 0; index--)
      if (!retained[index]) next = updateCopilotGroup(next, index, undefined)
    if (
      !isDeepStrictEqual(
        parseCopilotDocument(next),
        groups.filter((_group, index) => retained[index])
      )
    )
      throw new AppError('WRITE_FAILED', '清理结果校验失败，原文件未修改。')
    return {
      path,
      original,
      next,
      managed,
      count,
      metadataChanged: !isDeepStrictEqual(previous, managed),
      revision: this.revision(path, original),
      removedGroups: groups.flatMap((group, index) => (retained[index] ? [] : [{ index, group }]))
    }
  }

  private async plan(providerIds: string[]): Promise<{
    path: string
    original: string | null
    next: string
    managed: ManagedGroups
    revision: string
  }> {
    this.validateProviderIds(providerIds)
    const path = this.getPath()
    const original = await this.targets.read(path)
    let next = original ?? '[]\n'
    parseCopilotDocument(original)
    const managed = this.managed(path)
    const providers = this.providers.list()
    const selected = new Set(providerIds)
    for (const [position, provider] of providers.entries()) {
      const { id, configuration: config } = provider
      if (!selected.has(id)) continue
      const clientConfig = buildCopilotClientConfiguration(
        config,
        copilotClientName(config.name, position, providers.length)
      )
      const owned = managed[id]
      const groups = parseCopilotDocument(next)
      const readName = groupNameReader(providers, managed)
      const matching = groups.flatMap((group, index) =>
        readName(group) === config.name ? [index] : []
      )
      const previous = groups.flatMap((group, index) =>
        owned && isDeepStrictEqual(group, owned.applied) ? [index] : []
      )
      const index = matching[0] ?? previous[0] ?? -1
      next = updateCopilotGroup(
        next,
        index,
        clientConfig,
        owned && isDeepStrictEqual(groups[index], owned.applied)
          ? {
              ...owned.desired,
              models: buildCopilotClientConfiguration(owned.desired).models
            }
          : undefined
      )
      // A renamed provider can collide with an existing group. Keep one target and remove its old copies.
      const obsolete = new Set(
        [...matching, ...previous].filter((candidate) => candidate !== index)
      )
      for (const candidate of [...obsolete].sort((a, b) => b - a))
        next = updateCopilotGroup(next, candidate, undefined)
      for (const [otherId, group] of Object.entries(managed))
        if (otherId !== id && group.desired.name === config.name) delete managed[otherId]
      const written = parseCopilotDocument(next)
      const applied = written[copilotGroupIndex(written, clientConfig.name)]
      if (!isObject(applied)) throw new AppError('WRITE_FAILED', 'Copilot 配置生成校验失败。')
      for (const [key, value] of Object.entries(clientConfig))
        if (!isDeepStrictEqual(applied[key], value))
          throw new AppError('WRITE_FAILED', 'Copilot 配置字段校验失败。')
      if (applied.apiKey !== clientConfig.apiKey)
        throw new AppError('WRITE_FAILED', 'Copilot 凭据配置校验失败。')
      managed[id] = { desired: config, applied }
    }
    // Only synchronize names of other applied providers, never their unapplied edits.
    for (const [position, provider] of providers.entries()) {
      const owned = managed[provider.id]
      if (!owned || selected.has(provider.id)) continue
      const name = copilotClientName(owned.desired.name, position, providers.length)
      if (name === owned.applied.name) continue
      const groups = parseCopilotDocument(next)
      const readName = groupNameReader(providers, managed)
      const matching = groups.flatMap((group, index) =>
        readName(group) === owned.desired.name ? [index] : []
      )
      if (!matching.length) continue
      const index = matching[0]
      if (matching.length > 1 || !isDeepStrictEqual(groups[index], owned.applied))
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '需要更新排序编号的供应商分组已在 VS Code 中修改。请将该供应商一并选中应用，或先恢复其配置后重试。'
        )
      if (
        groups.some(
          (group, candidate) =>
            isObject(group) &&
            candidate !== index &&
            group.vendor === 'customendpoint' &&
            group.name === name
        )
      )
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '排序编号与现有供应商分组重名，请先在 VS Code 中重命名冲突分组后重试。'
        )
      next = renameCopilotGroup(next, index, name)
      const applied = parseCopilotDocument(next)[index]
      if (!isObject(applied) || !isDeepStrictEqual(applied, { ...owned.applied, name }))
        throw new AppError('WRITE_FAILED', 'Copilot 排序编号校验失败，原文件未修改。')
      managed[provider.id] = { ...owned, applied }
    }
    return { path, original, next, managed, revision: this.revision(path, original) }
  }

  private async write(
    path: string,
    original: string | null,
    next: string | null,
    managed: ManagedGroups,
    reason: CopilotBackupSummary['reason'],
    options: { protectedId?: string; revision?: string } = {}
  ): Promise<void> {
    await this.writeChanges([{ path, original, next, managed }], reason, {
      protectedId: options.protectedId,
      commit: () => {
        if (options.revision) this.assertRevision(path, original, options.revision)
      }
    })
  }

  private async writeChanges(
    changes: CopilotFileChange[],
    reason: CopilotBackupSummary['reason'],
    options: { protectedId?: string; commit?: () => void } = {}
  ): Promise<void> {
    const backups: CopilotBackup[] = []
    for (const { path, original, next } of changes) {
      try {
        if (next !== original && !(await stat(dirname(path))).isDirectory())
          throw new Error('Not a directory')
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          ['EACCES', 'EPERM'].includes(String(error.code))
        )
          throw error
        throw new AppError(
          'PARENT_PATH_NOT_FOUND',
          'VS Code 配置目录不存在，请先安装并打开 VS Code，或选择已有 Profile 的配置目录。'
        )
      }
      if ((await this.targets.read(path)) !== original)
        throw new AppError('CONCURRENT_MODIFICATION', '工具配置已被外部修改，请刷新页面后重试。')
      backups.push({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        path,
        reason,
        originalFileExisted: original !== null,
        content: original,
        checksum: hashContent(original),
        managed: this.managed(path)
      })
    }
    this.database.transaction(() => {
      for (const backup of backups)
        this.database.sql
          .prepare('INSERT INTO copilot_backups VALUES (?, ?)')
          .run(backup.id, JSON.stringify(backup))
    })
    await this.targets.replace(
      Object.fromEntries(
        changes
          .filter(({ original, next }) => next !== original)
          .map(({ path, next }) => [path, next])
      ),
      false,
      {
        expected: Object.fromEntries(changes.map(({ path, original }) => [path, original])),
        commit: () => {
          options.commit?.()
          for (const { path, managed } of changes) this.saveManaged(path, managed)
        }
      }
    )
    // File writes, readback checks, and ownership commit share the existing recovery journal.
    const expired = this.backups()
      .filter((item) => item.id !== options.protectedId)
      .slice(20)
    this.database.transaction(() => {
      for (const item of expired)
        this.database.sql.prepare('DELETE FROM copilot_backups WHERE id = ?').run(item.id)
    })
  }

  private validateProviderIds(providerIds: string[]): void {
    if (
      !providerIds.length ||
      providerIds.length > 200 ||
      new Set(providerIds).size !== providerIds.length
    )
      throw new AppError('INVALID_INPUT', '请选择不重复的 Copilot 供应商。')
    for (const id of providerIds) this.providers.get(id)
  }

  private managed(path: string): ManagedGroups {
    return this.database.getSetting<ManagedGroups>('device_settings', this.managedKey(path)) ?? {}
  }

  private managedKey(path: string): string {
    return `copilot.managed:${process.platform === 'win32' ? path.toLowerCase() : path}`
  }

  private saveManaged(path: string, managed: ManagedGroups): void {
    this.database.setSetting('device_settings', this.managedKey(path), managed)
  }

  private backups(): CopilotBackup[] {
    const rows = this.database.sql
      .prepare('SELECT document FROM copilot_backups ORDER BY rowid DESC')
      .all() as Array<{ document: string }>
    try {
      return rows.map((row) => JSON.parse(row.document) as CopilotBackup)
    } catch {
      throw new AppError('STORAGE_CORRUPTED', 'Copilot 备份索引损坏，请从数据库备份恢复。')
    }
  }

  private revision(path: string, content: string | null): string {
    return hashContent(
      JSON.stringify([path, hashContent(content), this.providers.list(), this.managed(path)])
    )
  }

  private assertRevision(path: string, original: string | null, revision: string): void {
    if (this.revision(path, original) !== revision)
      throw new AppError('CONCURRENT_MODIFICATION', '配置或供应商已改变，请刷新页面后重试。')
  }
}

function groupNameReader(
  providers: CopilotProvider[],
  managed: ManagedGroups
): (group: unknown) => string | undefined {
  const names = new Set(providers.map((provider) => provider.configuration.name))
  const appliedNames = new Map<string, string>()
  for (const owned of Object.values(managed)) {
    names.add(owned.desired.name)
    if (typeof owned.applied.name === 'string')
      appliedNames.set(owned.applied.name, owned.desired.name)
  }
  return (group) =>
    isObject(group) && group.vendor === 'customendpoint' && typeof group.name === 'string'
      ? copilotProviderName(group.name, names, appliedNames)
      : undefined
}

function defaultCopilotPath(): string {
  if (process.platform === 'win32')
    return join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'Code',
      'User',
      'chatLanguageModels.json'
    )
  if (process.platform === 'darwin')
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Code',
      'User',
      'chatLanguageModels.json'
    )
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'Code',
    'User',
    'chatLanguageModels.json'
  )
}

function safeUrl(value: string): string {
  const url = new URL(value)
  if (url.search) url.search = '?REDACTED'
  return url.toString()
}

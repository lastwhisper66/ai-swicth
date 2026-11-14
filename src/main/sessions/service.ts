import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  SESSION_SOURCE_NAMES,
  type SessionSourceId,
  type SessionSource,
  type SessionSummary,
  type SessionQuery,
  type SessionList,
  type SessionDetail,
  type SessionDeleteItem,
  type SessionDeletePreview,
  type SessionDeleteResult
} from '@shared/sessions'
import type { AppDatabase } from '../database'
import { AppError } from '../errors'
import type { PathSettingsStore } from '../services/path-settings'
import type { WslRuntime } from '../services/wsl-runtime'
import { parseWslPath } from '../services/wsl'
import { missing, withinRoot } from './files'
import { NativeSessionRpc, SessionRpcError } from './native-rpc'
import { createSessionAdapters } from './adapters'
import { assertUnchanged } from './storage'
import type { SessionAdapter, SessionContent, SessionEntry as Entry } from './types'

interface Catalog {
  source: SessionSource
  entries: Entry[]
  warnings: string[]
  expires: number
  nativeAvailable: boolean
  signature?: string
  unavailableDirectories?: string[]
}
interface Conversation extends SessionContent {
  revision: string
}
interface DeletePlan {
  entries: Entry[]
  expires: number
  clearSource?: SessionSourceId
  sourceSignature?: string
}
interface RpcClient {
  pending: Promise<NativeSessionRpc>
  users: number
  timer?: ReturnType<typeof setTimeout>
}

export class SessionService {
  private catalogs = new Map<SessionSourceId, Promise<Catalog>>()
  private entries = new Map<string, Entry>()
  private conversations = new Map<string, Conversation>()
  private plans = new Map<string, DeletePlan>()
  private lock: Promise<unknown> = Promise.resolve()
  private clients = new Map<string, RpcClient>()
  private searchVersion = 0
  private stopped = false
  private mutations = 0

  private readonly adapters: Record<SessionSourceId, SessionAdapter>
  constructor(
    database: AppDatabase,
    paths: PathSettingsStore,
    private readonly wsl: WslRuntime
  ) {
    this.adapters = createSessionAdapters({ database, paths, wsl, rpc: this.rpc.bind(this) })
  }

  close(): void {
    this.stopped = true
    for (const client of this.clients.values()) {
      clearTimeout(client.timer)
      void client.pending.then((rpc) => rpc.close()).catch(() => undefined)
    }
    this.clients.clear()
    this.conversations.clear()
    this.entries.clear()
    this.plans.clear()
  }

  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.mutations++
    const task = this.lock.then(operation).finally(() => this.mutations--)
    this.lock = task.catch(() => undefined)
    return task
  }

  hasRunningTasks(): boolean {
    return this.mutations > 0
  }

  private async sources(id: SessionSourceId): Promise<SessionSource[]> {
    const directories = await this.adapters[id].directories(id)
    const distinct = new Map<string, string>()
    for (const path of directories) {
      const directory = resolve(path)
      distinct.set(process.platform === 'win32' ? directory.toLowerCase() : directory, directory)
    }
    return Promise.all([...distinct.values()].map((directory) => this.inspectSource(id, directory)))
  }

  private async inspectSource(id: SessionSourceId, directory: string): Promise<SessionSource> {
    const result: SessionSource = {
      id,
      name: SESSION_SOURCE_NAMES[id],
      directory,
      distribution: id.endsWith('-wsl') ? parseWslPath(directory).distribution : undefined,
      state: 'ready'
    }
    try {
      if (!(await lstat(directory)).isDirectory())
        throw new AppError('INVALID_INPUT', '会话数据位置不是目录，请检查原工具配置。')
      await withinRoot(directory, directory)
    } catch (error) {
      result.state = missing(error) ? 'missing' : 'error'
      result.message = missing(error)
        ? '此数据目录尚不存在，请先在原工具中创建会话。'
        : '无法读取此数据目录，请检查目录权限和原工具配置。'
    }
    return result
  }

  async list(query: SessionQuery): Promise<SessionList> {
    const searchVersion = ++this.searchVersion
    const catalog = await this.catalog(query.sourceId, query.refresh)
    const needle = query.search.trim().toLocaleLowerCase()
    const warnings = [...catalog.warnings]
    let entries = catalog.entries.filter(
      (entry) =>
        (query.project === undefined || entry.project === query.project) &&
        (!query.since || entry.updatedAt >= query.since)
    )
    if (needle) {
      const matches: Entry[] = []
      let unreadable = 0
      // Limit simultaneous reads; never send a whole transcript through list IPC.
      for (let offset = 0; offset < entries.length; offset += 2) {
        if (searchVersion !== this.searchVersion)
          throw new AppError('CONCURRENT_MODIFICATION', '检索条件已更新，已停止旧检索。')
        const batch = await Promise.all(
          entries.slice(offset, offset + 2).map(async (entry) => {
            const metadata = [
              ...(query.scope === 'all' || query.scope === 'title' ? [entry.title] : []),
              ...(query.scope === 'all' || query.scope === 'id' ? [entry.sessionId] : [])
            ]
              .join('\n')
              .toLocaleLowerCase()
            if (metadata.includes(needle)) return entry
            if (query.scope !== 'all' && query.scope !== 'content') return null
            try {
              const detail = await this.conversation(entry)
              if (detail.warnings.length) unreadable++
              return detail.messages.some((m) => m.text.toLocaleLowerCase().includes(needle))
                ? entry
                : null
            } catch {
              unreadable++
              return null
            }
          })
        )
        matches.push(...batch.filter((entry): entry is Entry => entry !== null))
      }
      if (unreadable)
        warnings.push(`${unreadable} 个会话未能完整检索，请检查权限、记录格式或 CLI 状态后刷新。`)
      entries = matches
    }
    if (query.groupBy === 'project')
      entries = [...entries].sort(
        (a, b) =>
          a.project.localeCompare(b.project, 'zh-CN') ||
          b.updatedAt.localeCompare(a.updatedAt) ||
          a.key.localeCompare(b.key)
      )
    const projects = new Map<string, number>()
    for (const entry of catalog.entries)
      projects.set(entry.project, (projects.get(entry.project) ?? 0) + 1)
    return {
      source: catalog.source,
      sessions: entries.slice(query.offset, query.offset + query.limit).map(summary),
      total: entries.length,
      projects: [...projects].map(([path, count]) => ({ path, count })),
      warnings
    }
  }

  async selectAll(query: SessionQuery): Promise<SessionSummary[]> {
    return (await this.list({ ...query, offset: 0, limit: 50_000 })).sessions
  }

  async read(key: string, offset: number, search?: string): Promise<SessionDetail> {
    const entry = await this.getEntry(key)
    const detail = await this.conversation(entry)
    if (search?.trim()) {
      const needle = search.trim().toLocaleLowerCase()
      const match = detail.messages.findIndex((message) =>
        message.text.toLocaleLowerCase().includes(needle)
      )
      if (match >= 0) offset = Math.floor(match / 100) * 100
    }
    return {
      session: summary(entry),
      messages: detail.messages.slice(offset, offset + 100),
      totalMessages: detail.messages.length,
      offset,
      warnings: detail.warnings
    }
  }

  async previewDelete(items: SessionDeleteItem[]): Promise<SessionDeletePreview> {
    for (const [token, plan] of this.plans) if (plan.expires < Date.now()) this.plans.delete(token)
    const entries: Entry[] = []
    const catalogs = new Map<SessionSourceId, Catalog>()
    for (const item of items) {
      const old = await this.getEntry(item.key)
      let catalog = catalogs.get(old.sourceId)
      if (!catalog) {
        catalog = await this.catalog(old.sourceId, true)
        catalogs.set(old.sourceId, catalog)
      }
      this.requireNativeCatalog(catalog, old)
      const entry = catalog.entries.find((e) => e.key === item.key)
      if (!entry || entry.revision !== item.revision)
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '所选会话已变化或已被删除，请刷新列表后重新选择。'
        )
      entries.push(entry)
    }
    // Include discovered spawned children in the confirmation, never unrelated forks.
    for (const catalog of catalogs.values())
      entries.push(
        ...this.related(catalog.entries, entries).filter(
          (e) => !entries.some((old) => old.key === e.key)
        )
      )
    return this.createDeletePlan(entries)
  }

  async previewClear(sourceId: SessionSourceId): Promise<SessionDeletePreview> {
    const catalog = await this.catalog(sourceId, true, true)
    this.requireCompleteCatalog(catalog)
    return this.createDeletePlan(catalog.entries, sourceId, catalog.signature)
  }

  private async createDeletePlan(
    entries: Entry[],
    clearSource?: SessionSourceId,
    sourceSignature?: string
  ): Promise<SessionDeletePreview> {
    for (const [token, plan] of this.plans) if (plan.expires < Date.now()) this.plans.delete(token)
    if (entries.length > 50_000)
      throw new AppError('INVALID_INPUT', '关联会话超过 50,000 个，请分批删除。')
    await this.assertIdleEntries(entries)
    const token = randomUUID()
    this.plans.set(token, {
      entries,
      clearSource,
      sourceSignature,
      expires: Date.now() + 5 * 60_000
    })
    while (this.plans.size > 10) this.plans.delete(this.plans.keys().next().value!)
    return {
      token,
      clearSource,
      sessions: entries.map(summary),
      notes: [
        ...(clearSource
          ? [
              `范围：${SESSION_SOURCE_NAMES[clearSource]} 的全部已发现会话，包括归档和隐藏的空会话。当前搜索、项目和时间筛选不限制此次清空。`
            ]
          : []),
        '将永久删除所列完整会话及对应的本地关联记录，不保留回收站或会话备份。项目代码和供应商配置不在删除范围内。',
        '请先关闭其他窗口中仍打开的这些会话，避免原工具再次写入记录。',
        ...new Set(entries.flatMap((entry) => this.adapters[entry.sourceId].deleteNotes))
      ]
    }
  }

  async delete(token: string): Promise<SessionDeleteResult> {
    const plan = this.plans.get(token)
    this.plans.delete(token)
    if (!plan || plan.expires < Date.now())
      throw new AppError('CONCURRENT_MODIFICATION', '删除确认已过期，请重新预览后确认。')
    // Check the entire batch before deleting its first entry.
    const sources = plan.clearSource
      ? [plan.clearSource]
      : [...new Set(plan.entries.map((entry) => entry.sourceId))]
    const currentEntries = new Map<string, Entry>()
    const plannedKeys = new Set(plan.entries.map((entry) => entry.key))
    for (const source of sources) {
      const catalog = await this.catalog(source, true, Boolean(plan.clearSource))
      if (plan.clearSource) {
        this.requireCompleteCatalog(catalog)
        if (
          catalog.signature !== plan.sourceSignature ||
          catalog.entries.some((entry) => !plannedKeys.has(entry.key))
        )
          throw new AppError(
            'CONCURRENT_MODIFICATION',
            '确认后会话范围或数据目录发生变化，未开始清空，请重新预览。'
          )
      }
      for (const entry of plan.entries.filter((item) => item.sourceId === source))
        this.requireNativeCatalog(catalog, entry)
      for (const entry of catalog.entries) currentEntries.set(entry.key, entry)
      const related = this.related(catalog.entries, plan.entries)
      if (related.some((entry) => !plannedKeys.has(entry.key)))
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '确认后出现了新的派生会话，请重新预览删除范围。'
        )
    }
    for (const old of plan.entries) {
      const current = currentEntries.get(old.key)
      if (!current || current.revision !== old.revision)
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '确认后会话发生了变化，本次未开始删除，请刷新后重试。'
        )
    }
    await this.assertIdleEntries(plan.entries.map((entry) => currentEntries.get(entry.key)!))
    const result: SessionDeleteResult = { deleted: [], failures: [], warnings: [] }
    const affected = new Set(plan.entries.map((e) => e.key))
    // Delete each Codex root once; its official API removes the confirmed subtree.
    const roots = plan.entries.filter(
      (entry) => !this.adapters[entry.sourceId].hasSelectedAncestor?.(entry, plan.entries)
    )
    const groups = roots.map((entry) => ({
      entry,
      related: this.adapters[entry.sourceId].related ? this.related(plan.entries, [entry]) : [entry]
    }))
    if (
      new Set(groups.flatMap(({ related }) => related.map((child) => child.key))).size !==
      plan.entries.length
    )
      throw new AppError(
        'INVALID_INPUT',
        '会话的派生关系异常，未执行删除。请在原工具中检查这些会话。'
      )
    for (const { entry, related } of groups) {
      try {
        const warnings = await this.adapters[entry.sourceId].remove(entry)
        result.deleted.push(...related.map((child) => child.key))
        for (const message of warnings)
          result.warnings.push({ key: entry.key, title: entry.title, message })
      } catch (error) {
        for (const child of related)
          result.failures.push({ key: child.key, title: child.title, message: safeError(error) })
      }
      for (const child of related) {
        this.conversations.delete(child.key)
        this.entries.delete(child.key)
      }
      this.catalogs.delete(entry.sourceId)
    }
    for (const [id, other] of this.plans)
      if (other.entries.some((entry) => affected.has(entry.key))) this.plans.delete(id)
    return result
  }

  private async getEntry(key: string): Promise<Entry> {
    const entry = this.entries.get(key)
    if (!entry) throw new AppError('PATH_NOT_FOUND', '会话不在当前列表中，请刷新后重新选择。')
    const sources = await this.sources(entry.sourceId)
    if (!sources.some((source) => source.directory === entry.source.directory))
      throw new AppError('CONCURRENT_MODIFICATION', '会话目录已变化，请刷新列表。')
    try {
      await assertUnchanged(entry)
    } catch (error) {
      this.conversations.delete(key)
      this.catalogs.delete(entry.sourceId)
      throw error
    }
    return entry
  }

  private async catalog(
    id: SessionSourceId,
    refresh = false,
    includeEmpty = false
  ): Promise<Catalog> {
    const sources = await this.sources(id)
    const signature = JSON.stringify(sources.map(({ directory, state }) => [directory, state]))
    if (includeEmpty) return this.scanSources(sources, signature, true)
    const pending = this.catalogs.get(id)
    if (pending && !refresh) {
      const cached = await pending
      if (cached.expires > Date.now() && cached.signature === signature) return cached
    }
    const next = this.scanSources(sources, signature)
    this.catalogs.set(id, next)
    try {
      return await next
    } catch (error) {
      if (this.catalogs.get(id) === next) this.catalogs.delete(id)
      throw error
    }
  }

  private async scanSources(
    sources: SessionSource[],
    signature: string,
    includeEmpty = false
  ): Promise<Catalog> {
    const catalogs: Catalog[] = []
    for (const source of sources) {
      try {
        catalogs.push(await this.scan(source, includeEmpty))
      } catch (error) {
        catalogs.push({
          source,
          entries: [],
          warnings: [`${source.directory}：${safeError(error)}`],
          nativeAvailable: false,
          expires: Date.now() + 30_000
        })
      }
    }
    const source = {
      ...(sources.find((item) => item.state === 'ready') ?? sources[0]),
      directories: sources.map((item) => item.directory)
    }
    const entries = catalogs
      .flatMap((item) => item.entries)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key))
    // Hidden entries discovered for clearing must never leak into the browsing cache.
    if (!includeEmpty) {
      for (const [key, entry] of this.entries)
        if (entry.sourceId === source.id) this.entries.delete(key)
      for (const entry of entries) this.entries.set(entry.key, entry)
    }
    return {
      source,
      entries,
      signature,
      warnings: catalogs.flatMap((item) => item.warnings),
      nativeAvailable: catalogs.every((item) => item.nativeAvailable),
      unavailableDirectories: catalogs
        .filter((item) => !item.nativeAvailable)
        .map((item) => item.source.directory),
      expires: Date.now() + 30_000
    }
  }

  private async scan(source: SessionSource, includeEmpty = false): Promise<Catalog> {
    if (source.state !== 'ready')
      return {
        source,
        entries: [],
        warnings: source.state === 'error' ? [source.directory + '：' + source.message] : [],
        nativeAvailable: false,
        expires: Date.now() + 30_000
      }
    const result = await this.adapters[source.id].scan(source, includeEmpty)
    return {
      source,
      entries: [...new Map(result.entries.map((entry) => [entry.key, entry])).values()],
      warnings: result.warnings,
      nativeAvailable: result.canDelete,
      expires: Date.now() + 30_000
    }
  }

  private requireCompleteCatalog(catalog: Catalog): void {
    if (catalog.warnings.length)
      throw new AppError(
        'UNKNOWN',
        `未能完整读取会话，无法清空。请先处理以下问题：${catalog.warnings.join('；')}`
      )
    for (const entry of catalog.entries) this.requireNativeCatalog(catalog, entry)
  }

  private related(catalog: Entry[], selected: Entry[]): Entry[] {
    const keys = new Set(selected.map((entry) => entry.key))
    const found = new Map(
      catalog.filter((entry) => keys.has(entry.key)).map((entry) => [entry.key, entry])
    )
    for (const id of new Set(catalog.map((entry) => entry.sourceId)))
      for (const entry of this.adapters[id].related?.(catalog, selected) ?? [])
        found.set(entry.key, entry)
    return [...found.values()]
  }

  private async conversation(entry: Entry): Promise<Conversation> {
    const cached = this.conversations.get(entry.key)
    if (cached?.revision === entry.revision) return cached
    const detail: Conversation = {
      ...(await this.adapters[entry.sourceId].read(entry)),
      revision: entry.revision
    }
    if (!detail.messages.length)
      detail.warnings.push('此会话没有可识别的对话消息，可能是空会话或原工具采用了新的记录格式。')
    this.conversations.delete(entry.key)
    this.conversations.set(entry.key, detail)
    while (
      this.conversations.size > 20 ||
      [...this.conversations.values()].reduce(
        (bytes, item) =>
          bytes + item.messages.reduce((size, message) => size + message.text.length * 2, 0),
        0
      ) >
        64 * 1024 * 1024
    )
      this.conversations.delete(this.conversations.keys().next().value!)
    return detail
  }

  private async assertIdleEntries(entries: Entry[]): Promise<void> {
    for (const id of new Set(entries.map((entry) => entry.sourceId)))
      await this.adapters[id].assertIdle(entries.filter((entry) => entry.sourceId === id))
  }

  private async rpc<T>(
    kind: 'codex' | 'copilot',
    source: SessionSource,
    operation: (client: NativeSessionRpc) => Promise<T>
  ): Promise<T> {
    if (this.stopped) throw new AppError('UNKNOWN', '应用正在退出，无法继续会话操作。')
    const key = `${source.id}\0${source.directory}`
    let slot = this.clients.get(key)
    if (!slot) {
      slot = { pending: NativeSessionRpc.open(kind, source, this.wsl), users: 0 }
      this.clients.set(key, slot)
    }
    clearTimeout(slot.timer)
    slot.users++
    try {
      const client = await slot.pending
      if (client.closed || this.stopped) {
        if (this.clients.get(key) === slot) this.clients.delete(key)
        throw new AppError('UNKNOWN', '会话服务已退出，请重新刷新后重试。')
      }
      return await operation(client)
    } catch (error) {
      if (this.clients.get(key) === slot) this.clients.delete(key)
      void slot.pending.then((client) => client.close()).catch(() => undefined)
      throw error
    } finally {
      slot.users--
      if (!slot.users && this.clients.get(key) === slot)
        slot.timer = setTimeout(() => {
          if (this.clients.get(key) === slot) this.clients.delete(key)
          void slot.pending.then((client) => client.close()).catch(() => undefined)
        }, 30_000)
    }
  }

  private requireNativeCatalog(catalog: Catalog, entry: Entry): void {
    if (catalog.unavailableDirectories?.includes(entry.source.directory))
      throw new AppError(
        'UNKNOWN',
        '无法确认原工具中的完整会话列表，请安装或更新对应 CLI 后刷新，再执行删除。'
      )
  }
}

function summary(entry: Entry): SessionSummary {
  const { key, sourceId, sessionId, title, project, updatedAt, createdAt, archived, revision } =
    entry
  return { key, sourceId, sessionId, title, project, updatedAt, createdAt, archived, revision }
}

function safeError(error: unknown): string {
  if (error instanceof AppError || error instanceof SessionRpcError) return error.message
  if (error instanceof Error && 'code' in error && ['EACCES', 'EPERM'].includes(String(error.code)))
    return '没有权限访问会话，请关闭占用文件的程序并检查数据目录权限。'
  return '会话操作未完成，请关闭原工具后刷新重试。'
}

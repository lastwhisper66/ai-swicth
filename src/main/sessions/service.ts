import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rm, stat, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  SESSION_SOURCE_NAMES,
  type SessionSourceId,
  type SessionSource,
  type SessionSummary,
  type SessionQuery,
  type SessionList,
  type SessionMessage,
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
import { writeTextAtomic } from '../utils/files'
import { codexThreadMessages, parseConversation, record, text } from './messages'
import { fingerprint, missing, readEvents, sampleEvents, walk, withinRoot } from './files'
import { NativeSessionRpc, SessionRpcError } from './native-rpc'
import {
  defaultVsCodeUserDirectory,
  scanVsCodeSessions,
  readVsCodeSession,
  removeVsCodeSession,
  assertVsCodeClosed,
  type VsCodeSessionFiles
} from './vscode'

interface Entry extends SessionSummary {
  source: SessionSource
  file?: string
  fileRevision?: string
  parentId?: string
  vscode?: VsCodeSessionFiles
}
interface Catalog {
  source: SessionSource
  entries: Entry[]
  warnings: string[]
  expires: number
  nativeAvailable: boolean
  signature?: string
  unavailableDirectories?: string[]
}
interface Conversation {
  revision: string
  messages: SessionMessage[]
  warnings: string[]
}
interface DeletePlan {
  entries: Entry[]
  expires: number
}
interface RpcClient {
  pending: Promise<NativeSessionRpc>
  users: number
  timer?: ReturnType<typeof setTimeout>
}

const sourceKind = (id: SessionSourceId): 'claude' | 'codex' | 'copilot' | 'vscode' =>
  id.startsWith('claude')
    ? 'claude'
    : id.startsWith('codex')
      ? 'codex'
      : id === 'copilot-vscode'
        ? 'vscode'
        : 'copilot'
const iso = (value: unknown, fallback: string): string => {
  const date = new Date(typeof value === 'number' ? value * 1000 : text(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}
const keyFor = (source: SessionSource, id: string): string =>
  createHash('sha256').update(`${source.id}\0${source.directory}\0${id}`).digest('hex')

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

  constructor(
    private readonly database: AppDatabase,
    private readonly paths: PathSettingsStore,
    private readonly wsl: WslRuntime
  ) {}

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
    let directories: string[]
    if (id === 'copilot-cli') {
      directories = [
        join(homedir(), '.copilot'),
        resolve(process.env.COPILOT_HOME || join(homedir(), '.copilot'))
      ]
    } else if (id === 'copilot-vscode') {
      const configured = this.database.getSetting<string>('device_settings', 'copilot.path')
      directories = [defaultVsCodeUserDirectory(), ...(configured ? [dirname(configured)] : [])]
    } else directories = await this.paths.getSessionDirectories(id)
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
        (!query.project || entry.project === query.project) &&
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
      await this.assertIdle(entry)
      entries.push(entry)
    }
    // Include discovered spawned children in the confirmation, never unrelated forks.
    for (const catalog of catalogs.values())
      entries.push(
        ...descendants(catalog.entries, entries).filter(
          (e) => !entries.some((old) => old.key === e.key)
        )
      )
    for (const entry of entries) await this.assertIdle(entry)
    if (entries.length > 50_000)
      throw new AppError('INVALID_INPUT', '关联会话超过 50,000 个，请分批删除。')
    const token = randomUUID()
    this.plans.set(token, { entries, expires: Date.now() + 5 * 60_000 })
    while (this.plans.size > 10) this.plans.delete(this.plans.keys().next().value!)
    return {
      token,
      sessions: entries.map(summary),
      notes: [
        '将永久删除所列完整会话及对应的本地关联记录，不保留回收站或会话备份。项目代码、供应商配置和 Claude 项目记忆不在删除范围内。',
        '请先关闭其他窗口中仍打开的这些会话，避免原工具再次写入记录。',
        ...(entries.some((e) => e.sourceId.startsWith('codex'))
          ? ['Codex 使用原工具删除接口；该接口还会删除目标会话的派生子会话。']
          : []),
        ...(entries.some((e) => e.sourceId === 'copilot-cli')
          ? [
              'Copilot 仅请求删除本地磁盘会话；已同步到 GitHub 的副本需要在原工具或 GitHub 中另行管理。'
            ]
          : []),
        ...(entries.some((e) => e.sourceId === 'copilot-vscode')
          ? [
              'VS Code 会话采用本地存储适配；请退出所有 VS Code 窗口后删除，避免编辑器缓存将会话重新写回。'
            ]
          : [])
      ]
    }
  }

  async delete(token: string): Promise<SessionDeleteResult> {
    const plan = this.plans.get(token)
    this.plans.delete(token)
    if (!plan || plan.expires < Date.now())
      throw new AppError('CONCURRENT_MODIFICATION', '删除确认已过期，请重新预览后确认。')
    // Check the entire batch before deleting its first entry.
    const sources = [...new Set(plan.entries.map((entry) => entry.sourceId))]
    const catalogs = new Map<SessionSourceId, Catalog>()
    for (const source of sources) {
      const catalog = await this.catalog(source, true)
      for (const entry of plan.entries.filter((item) => item.sourceId === source))
        this.requireNativeCatalog(catalog, entry)
      catalogs.set(source, catalog)
      const related = descendants(catalog.entries, plan.entries)
      if (related.some((entry) => !plan.entries.some((old) => old.key === entry.key)))
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '确认后出现了新的派生会话，请重新预览删除范围。'
        )
    }
    for (const old of plan.entries) {
      const current = catalogs.get(old.sourceId)!.entries.find((entry) => entry.key === old.key)
      if (!current || current.revision !== old.revision)
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '确认后会话发生了变化，本次未开始删除，请刷新后重试。'
        )
      await this.assertIdle(current)
    }
    const result: SessionDeleteResult = { deleted: [], failures: [], warnings: [] }
    const affected = new Set(plan.entries.map((e) => e.key))
    // Delete each Codex root once; its official API removes the confirmed subtree.
    const roots = plan.entries.filter((entry) => !hasSelectedAncestor(entry, plan.entries))
    if (
      new Set(
        roots.flatMap((entry) => descendants(plan.entries, [entry]).map((child) => child.key))
      ).size !== plan.entries.length
    )
      throw new AppError(
        'INVALID_INPUT',
        '会话的派生关系异常，未执行删除。请在原工具中检查这些会话。'
      )
    for (const entry of roots) {
      const related = descendants(plan.entries, [entry])
      try {
        const warnings = await this.remove(entry)
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
    if (entry.file) {
      await withinRoot(entry.source.directory, entry.file)
      if (
        (entry.vscode ? await entry.vscode.fingerprint() : await fingerprint(entry.file)) !==
        entry.fileRevision
      ) {
        this.conversations.delete(key)
        this.catalogs.delete(entry.sourceId)
        throw new AppError('CONCURRENT_MODIFICATION', '会话刚刚被原工具更新，请刷新后重新打开。')
      }
    }
    return entry
  }

  private async catalog(id: SessionSourceId, refresh = false): Promise<Catalog> {
    const sources = await this.sources(id)
    const signature = JSON.stringify(sources.map(({ directory, state }) => [directory, state]))
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

  private async scanSources(sources: SessionSource[], signature: string): Promise<Catalog> {
    const catalogs: Catalog[] = []
    for (const source of sources) {
      try {
        catalogs.push(await this.scan(source))
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
    for (const [key, entry] of this.entries)
      if (entry.sourceId === source.id) this.entries.delete(key)
    for (const entry of entries) this.entries.set(entry.key, entry)
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

  private async scan(source: SessionSource): Promise<Catalog> {
    const catalog: Catalog = {
      source,
      entries: [],
      warnings: [],
      expires: Date.now() + 30_000,
      nativeAvailable: false
    }
    if (source.state !== 'ready') {
      if (source.state === 'error') catalog.warnings.push(`${source.directory}：${source.message}`)
      return catalog
    }
    const kind = sourceKind(source.id)
    const root = source.directory
    if (kind === 'vscode') {
      const scanned = await scanVsCodeSessions(root)
      catalog.warnings.push(...scanned.warnings)
      catalog.entries = scanned.sessions.map((session) => ({
        ...session.summary,
        key: keyFor(source, `${session.files.storageDirectory}\0${session.summary.sessionId}`),
        source,
        sourceId: source.id,
        file: session.files.primary,
        fileRevision: session.summary.revision,
        vscode: session.files
      }))
      return catalog
    }
    const files =
      kind === 'claude'
        ? await walk(
            join(root, 'projects'),
            1,
            (name) => name.endsWith('.jsonl') && !name.startsWith('agent-')
          )
        : kind === 'codex'
          ? [
              ...(await walk(join(root, 'sessions'), 5, (name) => name.endsWith('.jsonl'))),
              ...(await walk(join(root, 'archived_sessions'), 5, (name) => name.endsWith('.jsonl')))
            ]
          : await walk(
              join(root, 'session-state'),
              1,
              (name) => name === 'events.jsonl' || name.endsWith('.jsonl')
            )
    let invalid = 0
    for (let offset = 0; offset < files.length; offset += 8) {
      const entries = await Promise.all(
        files.slice(offset, offset + 8).map(async (file) => {
          try {
            await withinRoot(root, file)
            const [events, info, fileRevision] = await Promise.all([
              sampleEvents(file),
              stat(file),
              fingerprint(file)
            ])
            const fallbackId =
              kind === 'copilot' ? basename(dirname(file)) : basename(file, '.jsonl')
            const parsed = parseConversation(kind, events, fallbackId, false)
            if (kind === 'claude' && parsed.sessionId !== fallbackId)
              throw new AppError('INVALID_INPUT', '会话标识与文件名不一致，已跳过此记录。')
            const meta = events.map(record).find((event) => event.type === 'session_meta')
            const spawn = record(record(record(record(meta?.payload).source).subagent).thread_spawn)
            const entry: Entry = {
              key: keyFor(source, parsed.sessionId),
              source,
              sourceId: source.id,
              sessionId: parsed.sessionId,
              title: parsed.title,
              project: parsed.project || (kind === 'claude' ? basename(dirname(file)) : ''),
              updatedAt: info.mtime.toISOString(),
              createdAt: info.birthtime.toISOString(),
              revision: fileRevision,
              fileRevision,
              file,
              archived: kind === 'codex' && file.includes('archived_sessions'),
              parentId: text(spawn.parent_thread_id) || undefined
            }
            return entry
          } catch {
            invalid++
            return null
          }
        })
      )
      catalog.entries.push(...entries.filter((entry): entry is Entry => entry !== null))
    }
    if (invalid) catalog.warnings.push(`${invalid} 个会话文件无法读取，请检查目录权限或记录格式。`)
    if (kind !== 'claude') {
      try {
        await this.mergeNative(catalog)
        catalog.nativeAvailable = true
      } catch {
        catalog.warnings.push(
          '原工具会话接口暂不可用，当前显示本地日志。需要更新或安装对应 CLI 才能执行删除。'
        )
      }
    } else {
      // Older Claude versions cache user titles here; the transcript remains the source of truth.
      const projectDirs = [...new Set(catalog.entries.map((entry) => dirname(entry.file!)))]
      for (const directory of projectDirs) {
        try {
          const indexPath = join(directory, 'sessions-index.json')
          await withinRoot(root, indexPath)
          const index = record(JSON.parse(await readFile(indexPath, 'utf8')))
          if (!Array.isArray(index.entries)) continue
          for (const raw of index.entries) {
            const item = record(raw)
            const entry = catalog.entries.find((entry) => entry.sessionId === item.sessionId)
            if (entry) {
              entry.title = text(item.customTitle) || text(item.summary) || entry.title
              entry.project = text(item.projectPath) || entry.project
            }
          }
        } catch (error) {
          if (!missing(error))
            catalog.warnings.push('部分 Claude 项目索引无法读取，已使用会话记录中的信息。')
        }
      }
    }
    catalog.entries = [
      ...new Map(catalog.entries.map((entry) => [entry.key, entry])).values()
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key))
    return catalog
  }

  private async mergeNative(catalog: Catalog): Promise<void> {
    const kind = sourceKind(catalog.source.id) as 'codex' | 'copilot'
    await this.rpc(kind, catalog.source, async (client) => {
      const rows: Array<{ value: unknown; archived: boolean }> = []
      if (kind === 'copilot') {
        const response = record(await client.request('session.list', {}))
        if (!Array.isArray(response.sessions)) throw new Error('Unsupported session list')
        rows.push(
          ...response.sessions
            .filter((s) => !record(s).isRemote)
            .map((value) => ({ value, archived: false }))
        )
      } else {
        for (const archived of [false, true]) {
          let cursor: string | undefined
          do {
            const response = record(
              await client.request('thread/list', {
                archived,
                limit: 100,
                cursor,
                sourceKinds: [
                  'cli',
                  'vscode',
                  'exec',
                  'appServer',
                  'subAgent',
                  'subAgentReview',
                  'subAgentCompact',
                  'subAgentThreadSpawn',
                  'subAgentOther',
                  'unknown'
                ],
                modelProviders: [],
                sortKey: 'updated_at'
              })
            )
            if (!Array.isArray(response.data)) throw new Error('Unsupported thread list')
            rows.push(...response.data.map((value) => ({ value, archived })))
            cursor = text(response.nextCursor) || undefined
            if (rows.length >= 50_000) throw new Error('Too many sessions')
          } while (cursor)
        }
      }
      const byId = new Map(catalog.entries.map((entry) => [entry.sessionId, entry]))
      for (const { value, archived } of rows) {
        const row = record(value)
        const id = text(row.id) || text(row.sessionId)
        if (!id) continue
        const existing = byId.get(id)
        const updatedAt = iso(
          row.updatedAt ?? row.modifiedTime,
          existing?.updatedAt ?? new Date(0).toISOString()
        )
        const context = record(row.context)
        const spawn = record(record(record(row.source).subAgent).thread_spawn)
        const entry: Entry = {
          ...existing,
          key: keyFor(catalog.source, id),
          source: catalog.source,
          sourceId: catalog.source.id,
          sessionId: id,
          title:
            text(row.name) ||
            text(row.summary) ||
            text(row.preview).slice(0, 160) ||
            existing?.title ||
            '未命名会话',
          project: text(row.cwd) || text(context.cwd) || existing?.project || '',
          createdAt: iso(row.createdAt ?? row.startTime, existing?.createdAt ?? updatedAt),
          updatedAt,
          archived,
          revision: `${existing?.fileRevision ?? id}:${updatedAt}`,
          parentId:
            existing?.parentId ||
            text(row.parentThreadId) ||
            text(spawn.parent_thread_id) ||
            undefined
        }
        if (existing) Object.assign(existing, entry)
        else {
          catalog.entries.push(entry)
          byId.set(id, entry)
        }
      }
    })
  }

  private async conversation(entry: Entry): Promise<Conversation> {
    const cached = this.conversations.get(entry.key)
    if (cached?.revision === entry.revision) return cached
    let detail: Conversation
    if (entry.vscode) {
      const parsed = await readVsCodeSession(entry.vscode)
      if ((await entry.vscode.fingerprint()) !== entry.fileRevision)
        throw new AppError('CONCURRENT_MODIFICATION', 'VS Code 会话已变化，请刷新后重试。')
      detail = { ...parsed, revision: entry.revision }
    } else if (entry.file) {
      await withinRoot(entry.source.directory, entry.file)
      const before = await fingerprint(entry.file)
      const { events, warnings } = await readEvents(entry.file)
      const parsed = parseConversation(
        sourceKind(entry.sourceId) as 'claude' | 'codex' | 'copilot',
        events,
        entry.sessionId
      )
      if ((await fingerprint(entry.file)) !== before || before !== entry.fileRevision)
        throw new AppError('CONCURRENT_MODIFICATION', '读取过程中会话发生变化，请刷新后重新打开。')
      detail = { messages: parsed.messages, warnings, revision: entry.revision }
    } else {
      detail = await this.rpc(
        sourceKind(entry.sourceId) as 'codex' | 'copilot',
        entry.source,
        async (client) => {
          if (sourceKind(entry.sourceId) === 'copilot') {
            const response = record(
              await client.request('session.getMessages', { sessionId: entry.sessionId })
            )
            if (!Array.isArray(response.events))
              throw new AppError(
                'UNKNOWN',
                'Copilot CLI 返回了不受支持的消息格式，请更新 CLI 后重试。'
              )
            const parsed = parseConversation('copilot', response.events, entry.sessionId)
            return { messages: parsed.messages, warnings: [], revision: entry.revision }
          }
          const turns: unknown[] = []
          let cursor: string | undefined
          try {
            do {
              const response = record(
                await client.request('thread/turns/list', {
                  threadId: entry.sessionId,
                  limit: 100,
                  cursor,
                  itemsView: 'full',
                  sortDirection: 'asc'
                })
              )
              if (!Array.isArray(response.data)) throw new Error('Unsupported turn response')
              turns.push(...response.data)
              cursor = text(response.nextCursor) || undefined
              if (turns.length > 100_000) throw new Error('Too many turns')
            } while (cursor)
          } catch (error) {
            if (!(error instanceof SessionRpcError) || error.rpcCode !== -32601) throw error
            const response = record(
              await client.request('thread/read', { threadId: entry.sessionId, includeTurns: true })
            )
            const thread = record(response.thread)
            turns.push(...(Array.isArray(thread.turns) ? thread.turns : []))
          }
          return { messages: codexThreadMessages(turns), warnings: [], revision: entry.revision }
        }
      )
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

  private async assertIdle(entry: Entry): Promise<void> {
    if (entry.vscode) {
      await assertVsCodeClosed()
      if ((await entry.vscode.fingerprint()) !== entry.fileRevision)
        throw new AppError('CONCURRENT_MODIFICATION', 'VS Code 会话已变化，请刷新后重试。')
    }
    if (entry.file) {
      await withinRoot(entry.source.directory, entry.file)
      if (!entry.vscode && (await fingerprint(entry.file)) !== entry.fileRevision)
        throw new AppError('CONCURRENT_MODIFICATION', '会话已被更新，请刷新后重新确认。')
      if (Date.now() - (await stat(entry.file)).mtimeMs < 15_000)
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '此会话最近仍在写入，请先关闭原工具中的会话，等待 15 秒后刷新重试。'
        )
    }
    if (sourceKind(entry.sourceId) === 'claude') {
      const markers = await walk(join(entry.source.directory, 'sessions'), 0, (name) =>
        name.endsWith('.json')
      )
      for (const marker of markers) {
        await withinRoot(entry.source.directory, marker)
        const state = record(JSON.parse(await readFile(marker, 'utf8')))
        if (state.sessionId !== entry.sessionId) continue
        if (typeof state.pid === 'number' && Number.isSafeInteger(state.pid) && state.pid > 0) {
          let alive = true
          if (entry.source.distribution)
            alive = await this.wsl.isProcessRunning(state.pid, entry.source.distribution)
          else
            try {
              process.kill(state.pid, 0)
            } catch (error) {
              alive = !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
            }
          if (alive)
            throw new AppError(
              'CONCURRENT_MODIFICATION',
              '此 Claude 会话仍在运行，请先关闭后重试。'
            )
        }
      }
    } else if (sourceKind(entry.sourceId) === 'codex') {
      await this.rpc('codex', entry.source, async (client) => {
        const response = record(await client.request('thread/read', { threadId: entry.sessionId }))
        if (record(record(response.thread).status).type === 'active')
          throw new AppError('CONCURRENT_MODIFICATION', '此 Codex 会话正在运行，请先关闭后重试。')
      })
    }
  }

  private async remove(entry: Entry): Promise<string[]> {
    if (entry.vscode) {
      await this.assertIdle(entry)
      return removeVsCodeSession(entry.vscode, entry.sessionId)
    }
    if (sourceKind(entry.sourceId) !== 'claude') {
      await this.rpc(
        sourceKind(entry.sourceId) as 'codex' | 'copilot',
        entry.source,
        async (client) => {
          const response = await client.request(
            sourceKind(entry.sourceId) === 'codex' ? 'thread/delete' : 'session.delete',
            sourceKind(entry.sourceId) === 'codex'
              ? { threadId: entry.sessionId }
              : { sessionId: entry.sessionId }
          )
          if (sourceKind(entry.sourceId) === 'copilot' && record(response).success !== true)
            throw new AppError('UNKNOWN', 'Copilot CLI 未确认删除成功，请刷新列表后重试。')
        }
      )
      return []
    }
    if (!entry.file || !/^[\w-]{1,200}$/u.test(entry.sessionId))
      throw new AppError('INVALID_INPUT', 'Claude 会话标识格式不受支持，未执行删除。')
    const root = entry.source.directory
    const sessionDir = join(dirname(entry.file), entry.sessionId)
    const targets = [
      sessionDir,
      ...['file-history', 'tasks', 'image-cache', 'session-env', 'uploads'].map((dir) =>
        join(root, dir, entry.sessionId)
      ),
      join(root, 'debug', `${entry.sessionId}.txt`)
    ]
    // Validate all known file targets before making changes.
    for (const target of [entry.file, ...targets]) await withinRoot(root, target)
    await this.assertIdle(entry)
    // Keep associated data intact if removing the transcript itself fails.
    await unlink(entry.file)
    const warnings: string[] = []
    for (const target of targets) {
      try {
        await withinRoot(root, target)
        await rm(target, { recursive: true, force: true })
      } catch {
        warnings.push('会话正文已删除，部分附件或工具记录未能清理。请检查数据目录权限和文件占用。')
      }
    }
    try {
      await this.removeClaudeIndexes(entry)
    } catch {
      warnings.push(
        '会话正文已删除，共享历史或项目索引未能完整清理。请关闭原工具并检查历史文件权限。'
      )
    }
    return [...new Set(warnings)]
  }

  private async removeClaudeIndexes(entry: Entry): Promise<void> {
    const index = join(dirname(entry.file!), 'sessions-index.json')
    const history = join(entry.source.directory, 'history.jsonl')
    for (const path of [index, history]) {
      try {
        await withinRoot(entry.source.directory, path)
        const before = await fingerprint(path)
        if ((await stat(path)).size > 32 * 1024 * 1024)
          throw new AppError('UNKNOWN', '共享历史文件过大，正文已删除，请在原工具中整理历史索引。')
        const original = await readFile(path, 'utf8')
        let next: string
        if (path === index) {
          const document = record(JSON.parse(original))
          if (!Array.isArray(document.entries)) continue
          const remaining = document.entries.filter(
            (row) => record(row).sessionId !== entry.sessionId
          )
          if (remaining.length === document.entries.length) continue
          document.entries = remaining
          next = JSON.stringify(document, null, 2) + '\n'
        } else {
          next = original
            .split('\n')
            .filter((line) => {
              try {
                return record(JSON.parse(line)).sessionId !== entry.sessionId
              } catch {
                return true
              }
            })
            .join('\n')
        }
        if (next === original) continue
        if ((await fingerprint(path)) !== before)
          throw new AppError(
            'CONCURRENT_MODIFICATION',
            '会话记录已移除，但共享历史正在被原工具写入，未覆盖该历史文件。请关闭原工具后重试清理。'
          )
        await writeTextAtomic(path, next)
      } catch (error) {
        if (!missing(error)) throw error
      }
    }
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
    if (
      ['codex', 'copilot'].includes(sourceKind(catalog.source.id)) &&
      catalog.unavailableDirectories?.includes(entry.source.directory)
    )
      throw new AppError(
        'UNKNOWN',
        '无法确认原工具中的完整会话列表，请安装或更新对应 CLI 后刷新，再执行删除。'
      )
  }
}

function descendants(catalog: Entry[], selected: Entry[]): Entry[] {
  const selectedKeys = new Set(selected.map((entry) => entry.key))
  const found = new Map(
    catalog.filter((entry) => selectedKeys.has(entry.key)).map((entry) => [entry.key, entry])
  )
  const children = new Map<string, Entry[]>()
  for (const entry of catalog) {
    if (sourceKind(entry.sourceId) !== 'codex' || !entry.parentId) continue
    const key = `${entry.sourceId}\0${entry.source.directory}\0${entry.parentId}`
    const group = children.get(key) ?? []
    group.push(entry)
    children.set(key, group)
  }
  const queue = [...found.values()]
  for (let offset = 0; offset < queue.length; offset++) {
    const parent = queue[offset]
    for (const child of children.get(
      `${parent.sourceId}\0${parent.source.directory}\0${parent.sessionId}`
    ) ?? []) {
      if (found.has(child.key)) continue
      found.set(child.key, child)
      queue.push(child)
    }
  }
  return [...found.values()]
}

function hasSelectedAncestor(entry: Entry, selected: Entry[]): boolean {
  if (sourceKind(entry.sourceId) !== 'codex') return false
  return Boolean(
    entry.parentId &&
    selected.some(
      (item) =>
        item.sourceId === entry.sourceId &&
        item.source.directory === entry.source.directory &&
        item.sessionId === entry.parentId
    )
  )
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

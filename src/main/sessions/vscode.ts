import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import type { SessionMessage, SessionSummary } from '@shared/sessions'
import { AppError } from '../errors'
import { fingerprint, missing, readEvents, walk, withinRoot } from './files'
import { record, text } from './messages'

const INDEX_KEY = 'chat.ChatSessionStore.index'
const runFile = promisify(execFile)
const validId = (id: string): boolean => /^[\w-]{1,200}$/u.test(id)

export interface VsCodeSessionFiles {
  root: string
  storageDirectory: string
  primary: string
  transcripts: string[]
  index: string
  fingerprint: () => Promise<string>
}

export function defaultVsCodeUserDirectory(): string {
  if (process.platform === 'win32')
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Code', 'User')
  if (process.platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'Code', 'User')
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Code', 'User')
}

async function optionalFile(root: string, path: string): Promise<boolean> {
  try {
    await withinRoot(root, path)
    return (await lstat(path)).isFile()
  } catch (error) {
    if (missing(error)) return false
    throw error
  }
}

function readIndex(path: string): Record<string, unknown> {
  const database = new Database(path, { readonly: true, fileMustExist: true, timeout: 1000 })
  try {
    const row = database.prepare('SELECT value FROM ItemTable WHERE key = ?').get(INDEX_KEY) as
      { value: string | Buffer } | undefined
    if (!row) return {}
    const raw = typeof row.value === 'string' ? row.value : row.value.toString('utf8')
    const index = record(JSON.parse(raw))
    if (
      index.version !== 1 ||
      !index.entries ||
      typeof index.entries !== 'object' ||
      Array.isArray(index.entries)
    )
      throw new AppError('MALFORMED_CONFIG', 'VS Code 会话索引格式不受支持。')
    return record(index.entries)
  } finally {
    database.close()
  }
}

function uriLabel(value: unknown): string {
  const uri = text(value)
  if (!uri) return ''
  try {
    return uri.startsWith('file:') ? fileURLToPath(uri) : decodeURIComponent(uri)
  } catch {
    return uri
  }
}

async function sessionFiles(
  root: string,
  storageDirectory: string,
  id: string,
  index: string
): Promise<VsCodeSessionFiles> {
  const transcripts: string[] = []
  for (const extension of ['.json', '.jsonl']) {
    const file = join(storageDirectory, `${id}${extension}`)
    if (await optionalFile(root, file)) transcripts.push(file)
  }
  const files: VsCodeSessionFiles = {
    root,
    storageDirectory,
    index,
    transcripts,
    primary: transcripts.at(-1)!,
    fingerprint: async () => {
      const parts: string[] = []
      for (const extension of ['.json', '.jsonl']) {
        const file = join(storageDirectory, `${id}${extension}`)
        parts.push((await optionalFile(root, file)) ? await fingerprint(file) : 'missing')
      }
      return createHash('sha256').update(parts.join('\0')).digest('hex')
    }
  }
  return files
}

export async function scanVsCodeSessions(root: string): Promise<{
  sessions: Array<{ summary: Omit<SessionSummary, 'key' | 'sourceId'>; files: VsCodeSessionFiles }>
  warnings: string[]
}> {
  const warnings: string[] = []
  const sessions: Array<{
    summary: Omit<SessionSummary, 'key' | 'sourceId'>
    files: VsCodeSessionFiles
  }> = []
  const locations: Array<{ storage: string; index: string; project: string }> = []
  const workspaces = join(root, 'workspaceStorage')
  try {
    if (await optionalDirectory(root, workspaces)) {
      for (const item of await readdir(workspaces, { withFileTypes: true })) {
        if (!item.isDirectory() || item.isSymbolicLink()) continue
        const directory = join(workspaces, item.name)
        await withinRoot(root, directory)
        let project = item.name === 'no-workspace' ? '' : `工作区 ${item.name}`
        try {
          const workspaceFile = join(directory, 'workspace.json')
          await withinRoot(root, workspaceFile)
          const workspace = record(JSON.parse(await readFile(workspaceFile, 'utf8')))
          project = uriLabel(workspace.folder) || uriLabel(workspace.workspace) || project
        } catch (error) {
          if (!missing(error)) warnings.push(`工作区 ${item.name} 的项目信息无法读取。`)
        }
        locations.push({
          storage: join(directory, 'chatSessions'),
          index: join(directory, 'state.vscdb'),
          project
        })
      }
    }
  } catch (error) {
    if (!missing(error)) throw error
  }
  locations.push({
    storage: join(root, 'globalStorage', 'emptyWindowChatSessions'),
    index: join(root, 'globalStorage', 'state.vscdb'),
    project: ''
  })
  for (const location of locations) {
    if (!(await optionalDirectory(root, location.storage))) continue
    let index: Record<string, unknown> = {}
    try {
      if (await optionalFile(root, location.index)) index = readIndex(location.index)
    } catch {
      warnings.push(
        `${location.project || '无项目窗口'} 的 VS Code 标题索引无法读取，已使用正文信息。`
      )
    }
    const paths = await walk(location.storage, 0, (name) => /\.(json|jsonl)$/u.test(name))
    const ids = new Set(paths.map((path) => basename(path).replace(/\.(json|jsonl)$/u, '')))
    for (const id of ids) {
      if (!validId(id)) continue
      try {
        const files = await sessionFiles(root, location.storage, id, location.index)
        const before = await files.fingerprint()
        const data = await readDocument(files)
        if ((await files.fingerprint()) !== before) throw new Error('Session changed')
        if (text(data.sessionId) && data.sessionId !== id) throw new Error('Session ID mismatch')
        const metadata = record(index[id])
        const requests = Array.isArray(data.requests) ? data.requests.map(record) : []
        const first = requests
          .map((request) =>
            typeof request.message === 'string'
              ? request.message
              : text(record(request.message).text)
          )
          .find(Boolean)
        const info = await lstat(files.primary)
        const created = date(data.creationDate, info.birthtime.toISOString())
        const updated = date(
          metadata.lastMessageDate ?? requests.at(-1)?.timestamp,
          info.mtime.toISOString()
        )
        sessions.push({
          files,
          summary: {
            sessionId: id,
            title:
              text(metadata.title) ||
              text(data.customTitle) ||
              text(data.computedTitle) ||
              first?.slice(0, 160) ||
              '未命名会话',
            project: uriLabel(data.workingDirectory) || location.project,
            createdAt: created,
            updatedAt: updated,
            archived: false,
            revision: before
          }
        })
      } catch {
        warnings.push(`VS Code 会话 ${id} 无法完整读取，请关闭 VS Code 后刷新，或检查记录格式。`)
      }
      if (sessions.length >= 50_000)
        throw new AppError('UNKNOWN', 'VS Code 会话超过 50,000 个，已停止扫描。')
    }
  }
  return { sessions, warnings: [...new Set(warnings)] }
}

async function optionalDirectory(root: string, path: string): Promise<boolean> {
  try {
    await withinRoot(root, path)
    return (await lstat(path)).isDirectory()
  } catch (error) {
    if (missing(error)) return false
    throw error
  }
}

function date(value: unknown, fallback: string): string {
  const result = new Date(typeof value === 'number' ? value : text(value))
  return Number.isFinite(result.getTime()) ? result.toISOString() : fallback
}

async function readDocument(files: VsCodeSessionFiles): Promise<Record<string, unknown>> {
  await withinRoot(files.root, files.primary)
  if ((await lstat(files.primary)).size > 128 * 1024 * 1024)
    throw new AppError('UNKNOWN', 'VS Code 会话超过 128 MiB，请在原工具中查看。')
  let value: unknown
  if (files.primary.endsWith('.json')) {
    value = JSON.parse(await readFile(files.primary, 'utf8'))
  } else {
    const { events, warnings } = await readEvents(files.primary)
    if (warnings.length) throw new Error('Incomplete VS Code operation log')
    // JSONL stores an initial snapshot followed by property and array mutations.
    for (const raw of events) {
      const event = record(raw)
      if (event.kind === 0) {
        value = event.v
        continue
      }
      const path = event.k
      if (
        !Array.isArray(path) ||
        path.some(
          (part) =>
            !(typeof part === 'string' || (Number.isSafeInteger(part) && Number(part) >= 0)) ||
            ['__proto__', 'constructor', 'prototype'].includes(String(part))
        )
      )
        throw new Error('Invalid operation path')
      if (!path.length) {
        if (event.kind !== 1) throw new Error('Unsupported root operation')
        value = event.v
        continue
      }
      let parent = value as Record<string, unknown>
      for (const segment of path.slice(0, -1)) {
        if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, segment))
          throw new Error('Missing operation parent')
        parent = parent[segment] as Record<string, unknown>
      }
      if (!parent || typeof parent !== 'object') throw new Error('Invalid operation parent')
      const key = path.at(-1)!
      if (event.kind === 1) parent[key] = event.v
      else if (event.kind === 3) delete parent[key]
      else if (event.kind === 2) {
        const array = parent[key] ?? []
        if (!Array.isArray(array) || (event.v !== undefined && !Array.isArray(event.v)))
          throw new Error('Invalid array operation')
        if (event.i !== undefined) {
          if (
            !Number.isSafeInteger(event.i) ||
            Number(event.i) < 0 ||
            Number(event.i) > array.length
          )
            throw new Error('Invalid array index')
          array.length = Number(event.i)
        }
        if (Array.isArray(event.v)) for (const item of event.v) array.push(item)
        parent[key] = array
      } else throw new Error('Unknown VS Code operation')
    }
  }
  const document = record(value)
  if (!Array.isArray(document.requests)) throw new Error('Unsupported VS Code session format')
  return document
}

export async function readVsCodeSession(
  files: VsCodeSessionFiles
): Promise<{ messages: SessionMessage[]; warnings: string[] }> {
  const document = await readDocument(files)
  const messages: SessionMessage[] = []
  const add = (message: SessionMessage): void => {
    if (message.text.trim()) messages.push(message)
  }
  for (const [index, raw] of (document.requests as unknown[]).entries()) {
    const request = record(raw)
    const id = text(request.requestId) || String(index)
    const timestamp = date(request.timestamp, '')
    add({
      id: `${id}:user`,
      role: 'user',
      text:
        typeof request.message === 'string' ? request.message : text(record(request.message).text),
      timestamp: timestamp || undefined
    })
    let markdown: string[] = []
    let partNumber = 0
    const flush = (): void => {
      if (markdown.length)
        add({
          id: `${id}:answer:${partNumber++}`,
          role: 'assistant',
          text: markdown.join('\n\n'),
          timestamp: date(request.responseTimestamp, timestamp) || undefined
        })
      markdown = []
    }
    for (const rawPart of Array.isArray(request.response) ? request.response : []) {
      const part = record(rawPart)
      const body =
        typeof rawPart === 'string'
          ? rawPart
          : !part.kind
            ? text(part.value)
            : part.kind === 'markdownContent'
              ? text(record(part.content).value) || text(part.content)
              : ''
      if (body) markdown.push(body)
      else {
        flush()
        add({
          id: `${id}:record:${partNumber++}`,
          role: part.kind === 'thinking' ? 'system' : 'tool',
          label: text(part.toolId) || text(part.kind) || '工具记录',
          text: JSON.stringify(rawPart, null, 2),
          timestamp: timestamp || undefined
        })
      }
    }
    flush()
    const error = record(record(request.result).errorDetails)
    if (text(error.message))
      add({ id: `${id}:error`, role: 'system', label: '请求说明', text: text(error.message) })
  }
  return { messages, warnings: [] }
}

export async function assertVsCodeClosed(): Promise<void> {
  try {
    const result =
      process.platform === 'win32'
        ? await runFile('tasklist.exe', ['/FO', 'CSV', '/NH'], {
            windowsHide: true,
            timeout: 10_000,
            maxBuffer: 4 * 1024 * 1024
          })
        : await runFile('ps', ['-A', '-ww', '-o', 'pid=,comm='], {
            timeout: 10_000,
            maxBuffer: 4 * 1024 * 1024
          })
    if (
      process.platform === 'win32'
        ? /^"(?:Code|Code - Insiders|Code - OSS)\.exe"/imu.test(result.stdout)
        : await hasVsCodeProcess(result.stdout)
    )
      throw new AppError(
        'CONCURRENT_MODIFICATION',
        '请先退出所有 VS Code 窗口，再刷新并删除会话，避免编辑器缓存重新写入。'
      )
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('UNKNOWN', '无法确认 VS Code 已关闭，未执行删除。请检查进程访问权限后重试。')
  }
}

async function hasVsCodeProcess(output: string): Promise<boolean> {
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/u.exec(line)
    if (!match || Number(match[1]) === process.pid) continue
    const executable = match[2]
    if (
      /(?:^|\/)(?:code|code-insiders|code-oss)$/iu.test(executable) ||
      /\/(?:Visual Studio Code(?: - Insiders)?|Code - OSS)\.app\/Contents\//u.test(executable)
    )
      return true
    if (process.platform !== 'linux' || !/(?:^|\/)electron(?:[.-]?\d+)?$/iu.test(executable))
      continue
    // Distro packages can run Code OSS on a shared Electron executable.
    // Read NUL-delimited argv so paths with spaces keep their argument boundaries.
    let args: string[]
    try {
      args = (await readFile(`/proc/${match[1]}/cmdline`, 'utf8')).split('\0')
    } catch (error) {
      if (missing(error)) continue // The process exited after the ps snapshot.
      throw error
    }
    const entryPoint = args.slice(1).find((argument) => argument && !argument.startsWith('-'))
    if (
      entryPoint &&
      /\/(?:code|code-insiders|code-oss)\/(?:code\.js|out\/(?:main|cli)\.js|resources\/app(?:\/out\/(?:main|cli)\.js)?)$/iu.test(
        entryPoint
      )
    )
      return true
  }
  return false
}

export async function removeVsCodeSession(
  files: VsCodeSessionFiles,
  id: string
): Promise<string[]> {
  await assertVsCodeClosed()
  if (!validId(id)) throw new AppError('INVALID_INPUT', 'VS Code 会话 ID 无效。')
  for (const file of files.transcripts) await withinRoot(files.root, file)
  // Keep the preferred transcript until all older representations have been removed.
  for (const file of files.transcripts) await unlink(file)
  const warnings: string[] = []
  try {
    if (await optionalFile(files.root, files.index)) {
      const database = new Database(files.index, { fileMustExist: true, timeout: 1000 })
      try {
        database
          .transaction(() => {
            const row = database
              .prepare('SELECT value FROM ItemTable WHERE key = ?')
              .get(INDEX_KEY) as { value: string | Buffer } | undefined
            if (!row) return
            const raw = typeof row.value === 'string' ? row.value : row.value.toString('utf8')
            const index = record(JSON.parse(raw))
            if (
              index.version !== 1 ||
              !index.entries ||
              Array.isArray(index.entries) ||
              typeof index.entries !== 'object'
            )
              throw new Error('Unknown index format')
            if (!Object.hasOwn(index.entries, id)) return
            delete (index.entries as Record<string, unknown>)[id]
            database
              .prepare('UPDATE ItemTable SET value = ? WHERE key = ?')
              .run(JSON.stringify(index), INDEX_KEY)
          })
          .immediate()
      } finally {
        database.close()
      }
    }
  } catch {
    warnings.push('VS Code 会话正文已删除，标题索引未能清理。请检查 state.vscdb 权限或文件占用。')
  }
  return warnings
}

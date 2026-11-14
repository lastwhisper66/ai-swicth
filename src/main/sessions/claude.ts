import type { SessionMessage } from '@shared/sessions'
import {
  cleanText,
  contentText,
  record,
  text,
  type JsonRecord,
  type ParsedConversation
} from './messages'
import { readFile, rm, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { AppError } from '../errors'
import { writeTextAtomic } from '../utils/files'
import { fingerprint, missing, walk, withinRoot } from './files'
import { assertFileIdle, readJsonl, scanJsonl } from './storage'
import type { SessionAdapter, SessionContext, SessionEntry } from './types'

/** Normalize persisted events, not model context snapshots or streaming deltas. */
export function parseClaude(
  events: unknown[],
  fallbackId: string,
  reconstructBranch = true
): ParsedConversation {
  let sessionId = fallbackId
  let title = ''
  let project = ''
  const messages: SessionMessage[] = []
  const positions = new Map<string, number>()
  const add = (message: SessionMessage): void => {
    if (!message.text.trim()) return
    const previous = positions.get(message.id)
    if (previous !== undefined) messages[previous] = message
    else {
      positions.set(message.id, messages.length)
      messages.push(message)
    }
  }
  let sourceEvents = events.map(record)
  if (reconstructBranch) {
    // A resume/rewind can leave multiple branches in the same transcript.
    const byId = new Map(sourceEvents.filter((e) => text(e.uuid)).map((e) => [text(e.uuid), e]))
    const last = sourceEvents.findLast(
      (e) => (e.type === 'user' || e.type === 'assistant') && !e.isSidechain
    )
    if (last && text(last.uuid)) {
      const chain = new Set<string>()
      let current: JsonRecord | undefined = last
      while (current && text(current.uuid) && !chain.has(text(current.uuid))) {
        chain.add(text(current.uuid))
        current = byId.get(text(current.parentUuid))
      }
      sourceEvents = sourceEvents.filter(
        (e) => !['user', 'assistant'].includes(text(e.type)) || chain.has(text(e.uuid))
      )
    }
  }
  for (const [index, event] of sourceEvents.entries()) {
    const timestamp = text(event.timestamp) || undefined
    const id = text(event.uuid) || text(event.id) || `${index}`
    sessionId = text(event.sessionId) || sessionId
    project = text(event.cwd) || project
    if (event.type === 'custom-title') title = text(event.customTitle) || title
    if (event.type === 'summary' && !title) title = text(event.summary)
    const message = record(event.message)
    const role = text(message.role)
    if (!['user', 'assistant'].includes(role) || event.isSidechain) continue
    const blocks = Array.isArray(message.content) ? message.content : [message.content]
    for (const [blockIndex, raw] of blocks.entries()) {
      const block = record(raw)
      const blockId = `${id}:${blockIndex}`
      if (block.type === 'tool_use') {
        add({
          id: blockId,
          role: 'tool',
          label: text(block.name) || '工具调用',
          text: JSON.stringify(block.input ?? {}, null, 2),
          timestamp,
          kind: 'tool-call',
          toolCallId: text(block.id) || undefined
        })
      } else if (block.type === 'tool_result') {
        add({
          id: blockId,
          role: 'tool',
          label: '工具结果',
          text: contentText(block.content),
          timestamp,
          kind: 'tool-result',
          toolCallId: text(block.tool_use_id) || undefined
        })
      } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        if (text(block.thinking))
          add({
            id: blockId,
            role: 'system',
            label: '思考记录',
            text: text(block.thinking),
            timestamp,
            kind: 'context'
          })
      } else {
        add({
          id: blockId,
          role: role as 'user' | 'assistant',
          text: typeof raw === 'string' ? cleanText(raw) : contentText([block]),
          timestamp
        })
      }
    }
  }
  if (!title)
    title =
      messages
        .find((m) => m.role === 'user')
        ?.text.split('\n')[0]
        .slice(0, 160) ?? ''
  return { sessionId, title: title || '未命名会话', project, messages }
}

export function createClaudeSessions(context: SessionContext): SessionAdapter {
  async function assertIdle(entries: SessionEntry[]): Promise<void> {
    for (const entry of entries) {
      await assertFileIdle(entry)
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
            alive = await context.wsl.isProcessRunning(state.pid, entry.source.distribution)
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
    }
  }
  async function removeIndexes(entry: SessionEntry): Promise<void> {
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
  return {
    directories: (id) =>
      context.paths.getSessionDirectories(id as 'claude-code' | 'claude-code-wsl'),
    async scan(source, includeEmpty) {
      const root = source.directory
      const files = await walk(
        join(root, 'projects'),
        1,
        (name) => name.endsWith('.jsonl') && !name.startsWith('agent-')
      )
      const catalog = await scanJsonl(source, files, includeEmpty, (events, file) => {
        const fallbackId = basename(file, '.jsonl')
        const parsed = parseClaude(events, fallbackId, false)
        if (parsed.sessionId !== fallbackId)
          throw new AppError('INVALID_INPUT', '会话标识与文件名不一致，已跳过此记录。')
        return {
          sessionId: parsed.sessionId,
          title: parsed.title,
          project: parsed.project || basename(dirname(file)),
          archived: false
        }
      })
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
      return catalog
    },
    read: (entry) => readJsonl(entry, parseClaude),
    assertIdle,
    async remove(entry) {
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
      for (const target of [entry.file, ...targets]) await withinRoot(root, target)
      await assertIdle([entry])
      await unlink(entry.file)
      const warnings: string[] = []
      for (const target of targets) {
        try {
          await withinRoot(root, target)
          await rm(target, { recursive: true, force: true })
        } catch {
          warnings.push(
            '会话正文已删除，部分附件或工具记录未能清理。请检查数据目录权限和文件占用。'
          )
        }
      }
      try {
        await removeIndexes(entry)
      } catch {
        warnings.push(
          '会话正文已删除，共享历史或项目索引未能完整清理。请关闭原工具并检查历史文件权限。'
        )
      }
      return [...new Set(warnings)]
    },
    deleteNotes: ['Claude 会话删除包含正文、关联附件及历史索引；项目代码和项目记忆会保留。']
  }
}

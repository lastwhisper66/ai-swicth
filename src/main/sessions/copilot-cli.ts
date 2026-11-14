import type { SessionMessage } from '@shared/sessions'
import { contentText, record, text, type ParsedConversation } from './messages'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { AppError } from '../errors'
import { walk } from './files'
import { assertFileIdle, readJsonl, scanJsonl, sessionKey, nativeUnavailable } from './storage'
import type { SessionAdapter, SessionContext } from './types'

/** Normalize persisted events, not model context snapshots or streaming deltas. */
export function parseCopilotCli(events: unknown[], fallbackId: string): ParsedConversation {
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
  const sourceEvents = events.map(record)
  for (const [index, event] of sourceEvents.entries()) {
    const data = record(event.data)
    const timestamp = text(event.timestamp) || undefined
    const id = text(event.uuid) || text(event.id) || `${index}`
    if (event.type === 'session.start') {
      sessionId = text(data.sessionId) || sessionId
      project = text(record(data.context).cwd) || project
    }
    if (event.type === 'session.info') title = text(data.summary) || title
    if (event.type === 'user.message' || event.type === 'assistant.message') {
      add({
        id: text(data.messageId) || id,
        role: event.type === 'user.message' ? 'user' : 'assistant',
        text: contentText(data.content),
        timestamp
      })
    } else if (event.type === 'tool.execution_start') {
      add({
        id,
        role: 'tool',
        label: text(data.toolName) || '工具调用',
        text:
          typeof data.arguments === 'string'
            ? data.arguments
            : JSON.stringify(data.arguments ?? {}, null, 2),
        timestamp,
        kind: 'tool-call',
        toolCallId: text(data.toolCallId) || text(data.executionId) || undefined
      })
    } else if (event.type === 'tool.execution_complete') {
      add({
        id,
        role: 'tool',
        label: '工具结果',
        text:
          contentText(record(data.result).content) ||
          text(data.result) ||
          text(record(data.error).message),
        timestamp,
        kind: 'tool-result',
        toolCallId: text(data.toolCallId) || text(data.executionId) || undefined
      })
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

const iso = (value: unknown, fallback: string): string => {
  const date = new Date(typeof value === 'number' ? value * 1000 : text(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}
export function createCopilotCliSessions(context: SessionContext): SessionAdapter {
  return {
    directories: async () => [
      join(homedir(), '.copilot'),
      resolve(process.env.COPILOT_HOME || join(homedir(), '.copilot'))
    ],
    async scan(source, includeEmpty) {
      const files = await walk(join(source.directory, 'session-state'), 1, (n) =>
        n.endsWith('.jsonl')
      )
      const catalog = await scanJsonl(source, files, includeEmpty, (events, file) => {
        const parsed = parseCopilotCli(events, basename(dirname(file)))
        return {
          sessionId: parsed.sessionId,
          title: parsed.title,
          project: parsed.project,
          archived: false
        }
      })
      try {
        await context.rpc('copilot', source, async (client) => {
          const response = record(await client.request('session.list', {}))
          if (!Array.isArray(response.sessions) || response.sessions.length > 50_000)
            throw new Error('Unsupported session list')
          const byId = new Map(catalog.entries.map((entry) => [entry.sessionId, entry]))
          for (const raw of response.sessions) {
            const row = record(raw)
            if (row.isRemote) continue
            const id = text(row.sessionId) || text(row.id)
            if (!id) throw new Error('Missing session ID')
            const old = byId.get(id)
            const updatedAt = iso(
              row.updatedAt ?? row.modifiedTime,
              old?.updatedAt || new Date(0).toISOString()
            )
            byId.set(id, {
              ...old,
              source,
              sourceId: source.id,
              key: sessionKey(source, id),
              sessionId: id,
              title:
                text(row.name) ||
                text(row.summary) ||
                text(row.preview).slice(0, 160) ||
                old?.title ||
                '未命名会话',
              project: text(row.cwd) || text(record(row.context).cwd) || old?.project || '',
              updatedAt,
              createdAt: iso(row.createdAt ?? row.startTime, old?.createdAt || updatedAt),
              archived: false,
              revision: (old?.fileRevision || id) + ':' + updatedAt
            })
          }
          catalog.entries = [...byId.values()]
        })
      } catch {
        nativeUnavailable(catalog)
      }
      return catalog
    },
    async read(entry) {
      if (entry.file) return readJsonl(entry, parseCopilotCli)
      return context.rpc('copilot', entry.source, async (client) => {
        const response = record(
          await client.request('session.getMessages', { sessionId: entry.sessionId })
        )
        if (!Array.isArray(response.events))
          throw new AppError('UNKNOWN', 'Copilot CLI 消息格式不受支持，请更新 CLI 后重试。')
        return {
          messages: parseCopilotCli(response.events, entry.sessionId).messages,
          warnings: []
        }
      })
    },
    async assertIdle(entries) {
      for (const entry of entries) await assertFileIdle(entry)
    },
    async remove(entry) {
      await assertFileIdle(entry)
      const response = await context.rpc('copilot', entry.source, (client) =>
        client.request('session.delete', { sessionId: entry.sessionId })
      )
      if (record(response).success !== true)
        throw new AppError('UNKNOWN', 'Copilot CLI 未确认删除成功，请刷新列表后重试。')
      return []
    },
    deleteNotes: ['仅删除 Copilot CLI 本地会话；GitHub 中的远端副本需在原工具中另行管理。']
  }
}

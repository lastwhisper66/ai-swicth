import type { SessionMessage } from '@shared/sessions'
import { cleanText, contentText, record, text, type ParsedConversation } from './messages'
import { basename, join } from 'node:path'
import type { SessionSource } from '@shared/sessions'
import { AppError } from '../errors'
import { walk } from './files'
import { SessionRpcError } from './native-rpc'
import {
  assertFileIdle,
  readJsonl,
  scanJsonl,
  sessionKey as keyFor,
  nativeUnavailable
} from './storage'
import type { SessionAdapter, SessionContext, SessionEntry, SessionCatalog } from './types'

const NON_USER_FACING_PHASES = new Set([
  'analysis',
  'justify',
  'confidence',
  'summary',
  'delegate_summary',
  'juicepred'
])

function isUserFacingAssistant(value: Record<string, unknown>): boolean {
  const phases = [text(value.phase), text(value.channel)]
    .map((phase) => phase.toLocaleLowerCase())
    .filter(Boolean)
  return value.isHidden !== true && !phases.some((phase) => NON_USER_FACING_PHASES.has(phase))
}

function userContentText(value: unknown, metadataValue: unknown): string {
  if (!Array.isArray(value)) return contentText(value)
  const kinds = record(metadataValue).content_item_kinds
  if (!Array.isArray(kinds)) return contentText(value)
  return value
    .map((raw, index) => {
      const kind = text(kinds[index])
      return kind.startsWith('user.') ? contentText([raw]) : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function isCodexTaskSummary(value: string): boolean {
  return (
    /^\s{0,3}#{0,6}\s*Task and user intent\s*$/imu.test(value) &&
    /^\s{0,3}(?:#{1,6}\s*)?Authorized scope\s*:/imu.test(value)
  )
}

function assistantMessage(id: string, value: string, timestamp?: string): SessionMessage {
  if (isCodexTaskSummary(value))
    return {
      id,
      role: 'system',
      label: 'Codex 任务上下文摘要',
      text: value,
      timestamp,
      kind: 'context'
    }
  return { id, role: 'assistant', text: value, timestamp }
}

function assistantContentText(value: unknown): string {
  if (typeof value === 'string') return cleanText(value)
  if (!Array.isArray(value)) return ''
  return value
    .map((raw) => {
      if (typeof raw === 'string') return cleanText(raw)
      const block = record(raw)
      if (block.type === 'output_text' || block.type === 'text') return cleanText(text(block.text))
      if (block.type === 'refusal') return cleanText(text(block.refusal))
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

/** Normalize persisted events, not model context snapshots or streaming deltas. */
export function parseCodex(events: unknown[], fallbackId: string): ParsedConversation {
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
  const mirroredCodexEvents = new Set<number>()
  {
    // Some versions persist both protocol messages and matching user/agent events.
    const candidates = new Map<string, number[]>()
    for (const [index, event] of sourceEvents.entries()) {
      const payload = record(event.payload)
      if (event.type !== 'response_item' || payload.type !== 'message') continue
      const role = text(payload.role)
      const body = contentText(payload.content)
      const key = `${role}\0${body}`
      candidates.set(key, [...(candidates.get(key) ?? []), index])
    }
    for (const [index, event] of sourceEvents.entries()) {
      const payload = record(event.payload)
      if (event.type !== 'event_msg') continue
      const role =
        payload.type === 'user_message'
          ? 'user'
          : payload.type === 'agent_message'
            ? 'assistant'
            : ''
      const key = `${role}\0${text(payload.message)}`
      const matches = candidates.get(key)
      const match = matches?.findIndex((position) => Math.abs(position - index) <= 32) ?? -1
      if (match >= 0) {
        mirroredCodexEvents.add(index)
        matches!.splice(match, 1)
      }
    }
  }
  for (const [index, event] of sourceEvents.entries()) {
    const payload = record(event.payload)
    const timestamp = text(event.timestamp) || undefined
    const id = text(event.uuid) || text(event.id) || `${index}`
    if (event.type === 'session_meta') {
      sessionId = text(payload.id) || sessionId
      project = text(payload.cwd) || project
    }
    if (event.type === 'turn_context') project = text(payload.cwd) || project
    if (
      event.type === 'event_msg' &&
      !mirroredCodexEvents.has(index) &&
      (payload.type === 'user_message' ||
        (payload.type === 'agent_message' && isUserFacingAssistant(payload)))
    ) {
      const role = payload.type === 'user_message' ? 'user' : 'assistant'
      const message: SessionMessage =
        role === 'assistant'
          ? assistantMessage(id, cleanText(text(payload.message)), timestamp)
          : { id, role: 'user', text: cleanText(text(payload.message)), timestamp }
      add(message)
    }
    if (event.type === 'response_item') {
      if (payload.type === 'message' && ['user', 'assistant'].includes(text(payload.role))) {
        if (text(payload.role) === 'assistant' && !isUserFacingAssistant(payload)) continue
        const messageId = text(payload.id) || id
        const body =
          payload.role === 'assistant'
            ? assistantContentText(payload.content)
            : userContentText(payload.content, payload.internal_chat_message_metadata_passthrough)
        add(
          payload.role === 'assistant'
            ? assistantMessage(messageId, body, timestamp)
            : { id: messageId, role: 'user', text: body, timestamp }
        )
      } else if (['function_call', 'custom_tool_call'].includes(text(payload.type))) {
        add({
          id,
          role: 'tool',
          label: text(payload.name) || '工具调用',
          text: text(payload.arguments) || text(payload.input),
          timestamp,
          kind: 'tool-call',
          toolCallId: text(payload.call_id) || undefined
        })
      } else if (['function_call_output', 'custom_tool_call_output'].includes(text(payload.type))) {
        add({
          id,
          role: 'tool',
          label: '工具结果',
          text: contentText(payload.output),
          timestamp,
          kind: 'tool-result',
          toolCallId: text(payload.call_id) || undefined
        })
      }
    }
    if (event.type === 'compacted') {
      add({ id, role: 'system', label: '上下文压缩摘要', text: text(payload.message), timestamp })
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
export function codexThreadMessages(turns: unknown[]): SessionMessage[] {
  const messages: SessionMessage[] = []
  for (const rawTurn of turns) {
    const turn = record(rawTurn)
    if (!Array.isArray(turn.items)) continue
    for (const [index, raw] of turn.items.entries()) {
      const item = record(raw)
      const id = `${text(turn.id)}:${text(item.id) || index}`
      const role =
        item.type === 'userMessage' ? 'user' : item.type === 'agentMessage' ? 'assistant' : 'tool'
      if (item.type === 'userMessage' || item.type === 'agentMessage') {
        if (role === 'assistant' && !isUserFacingAssistant(item)) continue
        const body =
          role === 'assistant'
            ? text(item.text) || assistantContentText(item.content)
            : Array.isArray(item.content)
              ? userContentText(item.content, item.internal_chat_message_metadata_passthrough)
              : text(item.text) || contentText(item.content)
        messages.push(role === 'assistant' ? assistantMessage(id, body) : { id, role, text: body })
      } else if (item.type === 'commandExecution') {
        messages.push({
          id,
          role,
          label: '执行命令',
          text: [text(item.command), text(item.aggregatedOutput)].filter(Boolean).join('\n\n'),
          kind: 'activity'
        })
      } else if (item.type === 'fileChange') {
        messages.push({
          id,
          role,
          label: '文件修改',
          text: JSON.stringify(item.changes ?? [], null, 2),
          kind: 'activity'
        })
      } else if (item.type === 'mcpToolCall') {
        messages.push({
          id,
          role,
          label: `${text(item.server)} · ${text(item.tool)}`,
          text: JSON.stringify(
            { arguments: item.arguments, result: item.result, error: item.error },
            null,
            2
          ),
          kind: 'activity'
        })
      } else if (item.type === 'contextCompaction') {
        messages.push({
          id,
          role: 'system',
          label: '上下文已压缩',
          text: '此处的早期上下文已由原工具压缩。',
          kind: 'context'
        })
      }
    }
  }
  return messages.filter((m) => m.text.trim())
}

const iso = (value: unknown, fallback: string): string => {
  const date = new Date(typeof value === 'number' ? value * 1000 : text(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}
export function createCodexSessions(context: SessionContext): SessionAdapter {
  async function mergeNative(catalog: SessionCatalog, source: SessionSource): Promise<void> {
    await context.rpc('codex', source, async (client) => {
      const rows: Array<{ value: unknown; archived: boolean }> = []
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
      const byId = new Map(catalog.entries.map((entry) => [entry.sessionId, entry]))
      for (const { value, archived } of rows) {
        const row = record(value)
        const id = text(row.id) || text(row.sessionId)
        if (!id) throw new Error('Missing thread ID')
        const existing = byId.get(id)
        const updatedAt = iso(
          row.updatedAt ?? row.modifiedTime,
          existing?.updatedAt ?? new Date(0).toISOString()
        )
        const context = record(row.context)
        const spawn = record(record(record(row.source).subAgent).thread_spawn)
        const entry: SessionEntry = {
          ...existing,
          key: keyFor(source, id),
          source: source,
          sourceId: source.id,
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
  async function assertIdle(entries: SessionEntry[]): Promise<void> {
    for (const entry of entries) {
      await assertFileIdle(entry)
      await context.rpc('codex', entry.source, async (client) => {
        const response = record(await client.request('thread/read', { threadId: entry.sessionId }))
        if (record(record(response.thread).status).type === 'active')
          throw new AppError('CONCURRENT_MODIFICATION', '此 Codex 会话正在运行，请先关闭后重试。')
      })
    }
  }
  return {
    directories: (id) => context.paths.getSessionDirectories(id as 'codex' | 'codex-wsl'),
    async scan(source, includeEmpty) {
      const files = [
        ...(await walk(join(source.directory, 'sessions'), 5, (n) => n.endsWith('.jsonl'))),
        ...(await walk(join(source.directory, 'archived_sessions'), 5, (n) => n.endsWith('.jsonl')))
      ]
      const catalog = await scanJsonl(source, files, includeEmpty, (events, file) => {
        const parsed = parseCodex(events, basename(file, '.jsonl'))
        const meta = events.map(record).find((event) => event.type === 'session_meta')
        const spawn = record(record(record(record(meta?.payload).source).subagent).thread_spawn)
        return {
          sessionId: parsed.sessionId,
          title: parsed.title,
          project: parsed.project,
          archived: file.includes('archived_sessions'),
          parentId: text(spawn.parent_thread_id) || undefined
        }
      })
      try {
        await mergeNative(catalog, source)
      } catch {
        nativeUnavailable(catalog)
      }
      return catalog
    },
    async read(entry) {
      if (entry.file) return readJsonl(entry, parseCodex)
      return context.rpc('codex', entry.source, async (client) => {
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
        return { messages: codexThreadMessages(turns), warnings: [] }
      })
    },
    assertIdle,
    async remove(entry) {
      await assertIdle([entry])
      await context.rpc('codex', entry.source, (client) =>
        client.request('thread/delete', { threadId: entry.sessionId })
      )
      return []
    },
    related: descendants,
    hasSelectedAncestor,
    deleteNotes: ['Codex 通过原工具接口删除；派生子会话会一并纳入预览和删除范围。']
  }
}
function descendants(catalog: SessionEntry[], selected: SessionEntry[]): SessionEntry[] {
  const selectedKeys = new Set(selected.map((entry) => entry.key))
  const found = new Map(
    catalog.filter((entry) => selectedKeys.has(entry.key)).map((entry) => [entry.key, entry])
  )
  const children = new Map<string, SessionEntry[]>()
  for (const entry of catalog) {
    if (!entry.sourceId.startsWith('codex') || !entry.parentId) continue
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
function hasSelectedAncestor(entry: SessionEntry, selected: SessionEntry[]): boolean {
  if (!entry.sourceId.startsWith('codex')) return false
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

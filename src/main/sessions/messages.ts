import type { SessionMessage } from '@shared/sessions'
import { stripVTControlCharacters } from 'node:util'

export type JsonRecord = Record<string, unknown>
export const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
export const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const cleanText = (value: string): string => stripVTControlCharacters(value)

export function contentText(value: unknown): string {
  if (typeof value === 'string') return cleanText(value)
  if (!Array.isArray(value)) return ''
  return value
    .map((entry) => {
      const block = record(entry)
      if (block.type === 'image' || block.type === 'input_image') return '[图片附件]'
      if (block.type === 'tool_result') return contentText(block.content)
      return text(block.text) || text(block.content)
    })
    .filter(Boolean)
    .join('\n\n')
}

export interface ParsedConversation {
  sessionId: string
  title: string
  project: string
  messages: SessionMessage[]
}

/** Normalize persisted events, not model context snapshots or streaming deltas. */
export function parseConversation(
  kind: 'claude' | 'codex' | 'copilot',
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
  const mirroredCodexEvents = new Set<number>()
  if (kind === 'codex') {
    // Some versions persist both protocol messages and matching user/agent events.
    const candidates = new Map<string, number[]>()
    for (const [index, event] of sourceEvents.entries()) {
      const payload = record(event.payload)
      if (event.type !== 'response_item' || payload.type !== 'message') continue
      const key = `${text(payload.role)}\0${contentText(payload.content)}`
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
  if (kind === 'claude' && reconstructBranch) {
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
    const data = record(event.data)
    const payload = record(event.payload)
    const timestamp = text(event.timestamp) || undefined
    const id = text(event.uuid) || text(event.id) || `${index}`
    if (kind === 'claude') {
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
            timestamp
          })
        } else if (block.type === 'tool_result') {
          add({
            id: blockId,
            role: 'tool',
            label: '工具结果',
            text: contentText(block.content),
            timestamp
          })
        } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
          if (text(block.thinking))
            add({
              id: blockId,
              role: 'system',
              label: '思考记录',
              text: text(block.thinking),
              timestamp
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
    } else if (kind === 'codex') {
      if (event.type === 'session_meta') {
        sessionId = text(payload.id) || sessionId
        project = text(payload.cwd) || project
      }
      if (event.type === 'turn_context') project = text(payload.cwd) || project
      if (
        event.type === 'event_msg' &&
        !mirroredCodexEvents.has(index) &&
        (payload.type === 'user_message' || payload.type === 'agent_message')
      ) {
        add({
          id,
          role: payload.type === 'user_message' ? 'user' : 'assistant',
          text: cleanText(text(payload.message)),
          timestamp
        })
      }
      if (event.type === 'response_item') {
        if (payload.type === 'message' && ['user', 'assistant'].includes(text(payload.role))) {
          add({
            id: text(payload.id) || id,
            role: payload.role as 'user' | 'assistant',
            text: contentText(payload.content),
            timestamp
          })
        } else if (['function_call', 'custom_tool_call'].includes(text(payload.type))) {
          add({
            id,
            role: 'tool',
            label: text(payload.name) || '工具调用',
            text: text(payload.arguments) || text(payload.input),
            timestamp
          })
        } else if (
          ['function_call_output', 'custom_tool_call_output'].includes(text(payload.type))
        ) {
          add({ id, role: 'tool', label: '工具结果', text: contentText(payload.output), timestamp })
        }
      }
      if (event.type === 'compacted') {
        add({ id, role: 'system', label: '上下文压缩摘要', text: text(payload.message), timestamp })
      }
    } else {
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
          timestamp
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
        messages.push({ id, role, text: text(item.text) || contentText(item.content) })
      } else if (item.type === 'commandExecution') {
        messages.push({
          id,
          role,
          label: '执行命令',
          text: [text(item.command), text(item.aggregatedOutput)].filter(Boolean).join('\n\n')
        })
      } else if (item.type === 'fileChange') {
        messages.push({
          id,
          role,
          label: '文件修改',
          text: JSON.stringify(item.changes ?? [], null, 2)
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
          )
        })
      } else if (item.type === 'contextCompaction') {
        messages.push({
          id,
          role: 'system',
          label: '上下文已压缩',
          text: '此处的早期上下文已由原工具压缩。'
        })
      }
    }
  }
  return messages.filter((m) => m.text.trim())
}

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { setImmediate } from 'node:timers/promises'
import { hasControlCharacters } from '@shared/configuration'
import type { ToolId } from '@shared/ipc'
import { USAGE_LABEL_MAX_LENGTH } from '@shared/usage'
import type { UsageRecord } from '@shared/usage'

export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
const label = (value: unknown, fallback: string): string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= USAGE_LABEL_MAX_LENGTH &&
  !hasControlCharacters(value)
    ? value.trim()
    : fallback
const id = (value: string): string => createHash('sha256').update(value).digest('hex')

// Copied rollout items may have a different timestamp and object key order.
// Hash their semantic content inside the reader; never retain conversation text.
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  )
}

/** Read only usage and attribution; conversation content never leaves this reader. */
export async function parseUsageFile(
  path: string,
  toolId: ToolId
): Promise<{ records: UsageRecord[]; invalid: number }> {
  const stream = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  const records = new Map<string, UsageRecord>()
  let history = createHash('sha256').update(path)
  let model = '未知模型'
  let provider = '会话日志'
  let previous: number[] | undefined
  let invalid = 0
  let lineNumber = 0
  const codex = toolId.startsWith('codex')
  try {
    for await (const line of lines) {
      if (++lineNumber % 1000 === 0) await setImmediate()
      if (!line.trim()) continue
      let event: Record<string, unknown>
      try {
        event = object(JSON.parse(line))
      } catch {
        invalid++
        continue
      }
      const payload = object(event.payload)
      if (codex && event.type === 'session_meta') {
        // Forks contain their own metadata followed by the copied source metadata.
        // Restart the fingerprint at each source so copied prefixes retain their IDs.
        if (typeof payload.id === 'string') history = createHash('sha256').update(payload.id)
        provider = label(payload.model_provider, '会话日志')
        model = label(payload.model, model)
        continue
      }
      if (codex) {
        history.update(canonicalJson([event.type, payload])).update('\n')
        if (event.type === 'turn_context') model = label(payload.model, '未知模型')
      }
      const timestamp = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN
      if (!Number.isFinite(timestamp)) continue
      let record: UsageRecord
      if (codex) {
        if (event.type !== 'event_msg' || payload.type !== 'token_count') continue
        const info = object(payload.info)
        const total = object(info.total_token_usage)
        const hasTotal =
          typeof total.input_tokens === 'number' && typeof total.output_tokens === 'number'
        const current = hasTotal
          ? [
              count(total.input_tokens),
              count(total.cached_input_tokens),
              count(total.output_tokens)
            ]
          : undefined
        if (current && previous && current.every((n, i) => n === previous![i])) continue
        const last = object(info.last_token_usage)
        const hasLast =
          typeof last.input_tokens === 'number' && typeof last.output_tokens === 'number'
        const delta = current?.map((n, i) => Math.max(0, n - (previous?.[i] ?? 0)))
        // A cumulative-only first event is a baseline, not a single API request.
        const usage = hasLast
          ? [count(last.input_tokens), count(last.cached_input_tokens), count(last.output_tokens)]
          : previous && delta
            ? delta
            : undefined
        if (current) previous = current
        if (!usage || !usage.some(Boolean)) continue
        const cached = Math.min(usage[0], usage[1])
        record = {
          id: id(`${toolId}:${history.copy().digest('hex')}`),
          timestamp: new Date(timestamp).toISOString(),
          toolId,
          provider,
          model: label(info.model, model),
          input: usage[0] - cached,
          output: usage[2],
          cacheRead: cached,
          cacheWrite: 0,
          cost: null,
          estimated: false
        }
      } else {
        if (event.type !== 'assistant') continue
        const message = object(event.message)
        const usage = object(message.usage)
        if (!Object.keys(usage).length || message.model === '<synthetic>') continue
        const messageId = typeof message.id === 'string' ? message.id : event.uuid
        if (typeof messageId !== 'string') {
          invalid++
          continue
        }
        const cost = event.costUSD ?? message.costUSD
        record = {
          id: id(`${toolId}:${String(event.requestId ?? '')}:${messageId}`),
          timestamp: new Date(timestamp).toISOString(),
          toolId,
          provider: label(event.model_provider, '会话日志'),
          model: label(message.model, '未知模型'),
          input: count(usage.input_tokens),
          output: count(usage.output_tokens),
          cacheRead: count(usage.cache_read_input_tokens),
          cacheWrite: count(usage.cache_creation_input_tokens),
          cost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null,
          estimated: false
        }
        const existing = records.get(record.id)
        if (existing) {
          for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const)
            record[key] = Math.max(record[key], existing[key])
          record.timestamp = existing.timestamp
          record.cost = record.cost ?? existing.cost
        }
      }
      if (record.input + record.output + record.cacheRead + record.cacheWrite > 0)
        records.set(record.id, record)
    }
  } finally {
    lines.close()
    stream.destroy()
  }
  return { records: [...records.values()], invalid }
}

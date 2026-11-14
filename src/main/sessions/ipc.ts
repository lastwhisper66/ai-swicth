import { ipcMain } from 'electron'
import {
  SESSION_CHANNELS,
  SESSION_SOURCES,
  type SessionSourceId,
  type SessionQuery,
  type SessionDeleteItem
} from '@shared/sessions'
import { record } from './messages'
import { AppError } from '../errors'
import { registerBusinessHandler } from '../ipc'
import type { SessionService } from './service'

export function registerSessionIpc(rendererUrl: string, service: SessionService): () => void {
  const queryArgument = (args: unknown[]): SessionQuery => {
    const input = argument(args)
    if (!['all', 'title', 'content', 'id'].includes(String(input.scope))) throw invalid()
    if (input.groupBy !== 'time' && input.groupBy !== 'project') throw invalid()
    if (input.refresh !== undefined && typeof input.refresh !== 'boolean') throw invalid()
    const since = input.since === undefined ? undefined : string(input.since, 40)
    if (since && !Number.isFinite(Date.parse(since))) throw invalid()
    return {
      sourceId: sourceId(input.sourceId),
      search: string(input.search, 500),
      scope: input.scope as SessionQuery['scope'],
      groupBy: input.groupBy,
      project: input.project === undefined ? undefined : string(input.project, 32_000),
      since: since ? new Date(since).toISOString() : undefined,
      offset: integer(input.offset, 0, 50_000),
      limit: integer(input.limit, 1, 100),
      refresh: input.refresh as boolean | undefined
    }
  }
  registerBusinessHandler(SESSION_CHANNELS.list, rendererUrl, queryArgument, (input) =>
    service.list(input)
  )
  registerBusinessHandler(SESSION_CHANNELS.selectAll, rendererUrl, queryArgument, (input) =>
    service.selectAll(input)
  )
  registerBusinessHandler(
    SESSION_CHANNELS.previewClear,
    rendererUrl,
    (args) => sourceId(argument(args).sourceId),
    (id) => service.exclusive(() => service.previewClear(id))
  )
  registerBusinessHandler(
    SESSION_CHANNELS.read,
    rendererUrl,
    (args) => {
      const input = argument(args)
      return {
        key: key(input.key),
        offset: integer(input.offset, 0, 250_000),
        search: input.search === undefined ? undefined : string(input.search, 500)
      }
    },
    (input) => service.read(input.key, input.offset, input.search)
  )
  registerBusinessHandler(
    SESSION_CHANNELS.previewDelete,
    rendererUrl,
    (args) => {
      const input = argument(args)
      if (
        !Array.isArray(input.sessions) ||
        !input.sessions.length ||
        input.sessions.length > 50_000
      )
        throw invalid()
      const sessions: SessionDeleteItem[] = input.sessions.map((raw) => {
        const item = record(raw)
        return { key: key(item.key), revision: string(item.revision, 1000) }
      })
      if (new Set(sessions.map((item) => item.key)).size !== sessions.length) throw invalid()
      return sessions
    },
    (input) => service.exclusive(() => service.previewDelete(input))
  )
  registerBusinessHandler(
    SESSION_CHANNELS.delete,
    rendererUrl,
    (args) => {
      const token = string(argument(args).token, 50)
      if (!/^[\da-f-]{36}$/u.test(token)) throw invalid()
      return token
    },
    (token) => service.exclusive(() => service.delete(token))
  )
  return () => {
    for (const channel of Object.values(SESSION_CHANNELS)) ipcMain.removeHandler(channel)
    service.close()
  }
}

function argument(args: unknown[]): Record<string, unknown> {
  if (args.length !== 1 || !args[0] || typeof args[0] !== 'object' || Array.isArray(args[0]))
    throw invalid()
  return record(args[0])
}
function sourceId(value: unknown): SessionSourceId {
  if (!SESSION_SOURCES.includes(value as SessionSourceId)) throw invalid()
  return value as SessionSourceId
}
function string(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw invalid()
  return value
}
function key(value: unknown): string {
  const result = string(value, 64)
  if (!/^[\da-f]{64}$/u.test(result)) throw invalid()
  return result
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum)
    throw invalid()
  return value
}
function invalid(): AppError {
  return new AppError('INVALID_INPUT', '会话操作参数无效，请刷新页面后重试。')
}

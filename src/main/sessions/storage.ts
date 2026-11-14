import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import type { SessionSource } from '@shared/sessions'
import { AppError } from '../errors'
import { fingerprint, readEvents, sampleEvents, withinRoot } from './files'
import type { ParsedConversation } from './messages'
import type { SessionCatalog, SessionContent, SessionEntry } from './types'

export const sessionKey = (source: SessionSource, id: string): string =>
  createHash('sha256').update(`${source.id}\0${source.directory}\0${id}`).digest('hex')

export async function assertUnchanged(entry: SessionEntry): Promise<void> {
  if (!entry.file) return
  await withinRoot(entry.source.directory, entry.file)
  const revision = entry.fingerprint ? await entry.fingerprint() : await fingerprint(entry.file)
  if (revision !== entry.fileRevision)
    throw new AppError('CONCURRENT_MODIFICATION', '会话已被更新，请刷新后重新确认。')
}

export async function assertFileIdle(entry: SessionEntry): Promise<void> {
  await assertUnchanged(entry)
  if (entry.file && Date.now() - (await stat(entry.file)).mtimeMs < 15_000)
    throw new AppError(
      'CONCURRENT_MODIFICATION',
      '会话最近仍在写入，请关闭原工具中的会话，等待 15 秒后刷新重试。'
    )
}

export async function scanJsonl(
  source: SessionSource,
  files: string[],
  complete: boolean,
  describe: (
    events: unknown[],
    file: string
  ) => Pick<SessionEntry, 'sessionId' | 'title' | 'project' | 'archived' | 'parentId'>
): Promise<SessionCatalog> {
  const catalog: SessionCatalog = { entries: [], warnings: [], canDelete: true }
  let invalid = 0
  for (let offset = 0; offset < files.length; offset += 8) {
    const entries = await Promise.all(
      files.slice(offset, offset + 8).map(async (file) => {
        try {
          await withinRoot(source.directory, file)
          const before = await fingerprint(file)
          const { events, warnings } = complete
            ? await readEvents(file)
            : { events: await sampleEvents(file), warnings: [] }
          if (warnings.length || (await fingerprint(file)) !== before)
            throw new Error('Incomplete session')
          if (!events.length) throw new Error('Missing session metadata')
          const info = await stat(file)
          const metadata = describe(events, file)
          return {
            ...metadata,
            key: sessionKey(source, metadata.sessionId),
            source,
            sourceId: source.id,
            file,
            fileRevision: before,
            revision: before,
            createdAt: info.birthtime.toISOString(),
            updatedAt: info.mtime.toISOString()
          } satisfies SessionEntry
        } catch {
          invalid++
          return null
        }
      })
    )
    for (const entry of entries) if (entry) catalog.entries.push(entry)
  }
  if (invalid)
    catalog.warnings.push(`${invalid} 个会话文件无法完整读取，请检查目录权限或记录格式。`)
  return catalog
}

export async function readJsonl(
  entry: SessionEntry,
  parse: (events: unknown[], id: string) => ParsedConversation
): Promise<SessionContent> {
  await assertUnchanged(entry)
  const { events, warnings } = await readEvents(entry.file!)
  const { messages } = parse(events, entry.sessionId)
  await assertUnchanged(entry)
  return { messages, warnings }
}

export function nativeUnavailable(catalog: SessionCatalog): void {
  catalog.canDelete = false
  catalog.warnings.push(
    '原工具会话接口暂不可用，当前显示本地日志。请更新或安装对应 CLI 后再执行删除。'
  )
}

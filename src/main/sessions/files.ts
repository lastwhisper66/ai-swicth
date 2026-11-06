import { createReadStream } from 'node:fs'
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { AppError } from '../errors'

export function missing(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))
  )
}

/** Reject links and traversal at every existing component, including UNC roots. */
export async function withinRoot(root: string, target: string): Promise<void> {
  const rel = relative(resolve(root), resolve(target))
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel))
    throw new AppError('INVALID_INPUT', '会话路径不在已选择的数据目录内。')
  let current = resolve(root)
  for (const component of ['', ...rel.split(sep).filter(Boolean)]) {
    if (component) current = resolve(current, component)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new AppError('INVALID_INPUT', '会话目录包含符号链接，请选择实际的数据目录后重试。')
    } catch (error) {
      if (missing(error)) return
      throw error
    }
  }
  const [actualRoot, actualTarget] = await Promise.all([realpath(root), realpath(target)])
  const actualRelative = relative(actualRoot, actualTarget)
  if (
    actualRelative === '..' ||
    actualRelative.startsWith(`..${sep}`) ||
    isAbsolute(actualRelative)
  )
    throw new AppError('INVALID_INPUT', '会话实际位置超出数据目录，已停止操作。')
}

export async function walk(
  directory: string,
  depth: number,
  accept: (name: string) => boolean,
  files: string[] = []
): Promise<string[]> {
  if (files.length >= 50_000)
    throw new AppError('UNKNOWN', '会话文件超过 50,000 个，请缩小会话目录范围。')
  let entries
  try {
    if ((await lstat(directory)).isSymbolicLink()) return files
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (missing(error)) return files
    throw error
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory() && depth > 0) await walk(path, depth - 1, accept, files)
    else if (entry.isFile() && accept(entry.name)) {
      if (files.length >= 50_000)
        throw new AppError('UNKNOWN', '会话文件超过 50,000 个，请缩小会话目录范围。')
      files.push(path)
    }
  }
  return files
}

export async function fingerprint(path: string): Promise<string> {
  const info = await stat(path)
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`
}

export async function sampleEvents(path: string): Promise<unknown[]> {
  const handle = await open(path, 'r')
  try {
    const info = await handle.stat()
    const count = Math.min(info.size, 96 * 1024)
    const first = Buffer.alloc(count)
    await handle.read(first, 0, count, 0)
    const chunks = [first.toString('utf8')]
    if (info.size > count) {
      const last = Buffer.alloc(count)
      await handle.read(last, 0, count, info.size - count)
      chunks.push(last.toString('utf8'))
    }
    return chunks.flatMap((chunk) =>
      chunk.split('\n').flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
    )
  } finally {
    await handle.close()
  }
}

export async function readEvents(path: string): Promise<{ events: unknown[]; warnings: string[] }> {
  if ((await stat(path)).size > 128 * 1024 * 1024)
    throw new AppError(
      'UNKNOWN',
      '此会话超过 128 MiB，请使用原工具查看；未加载部分内容不会被当作完整检索结果。'
    )
  const stream = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  const events: unknown[] = []
  let invalid = 0
  try {
    for await (const line of lines) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line))
      } catch {
        invalid++
      }
      if (events.length > 250_000)
        throw new AppError('UNKNOWN', '此会话事件过多，请使用原工具查看。')
    }
  } finally {
    lines.close()
    stream.destroy()
  }
  return {
    events,
    warnings: invalid ? [`有 ${invalid} 行记录不完整或损坏，已跳过；可关闭原工具后刷新。`] : []
  }
}

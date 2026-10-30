import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AppError } from '../errors'

export async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function writeTextAtomic(
  filePath: string,
  content: string,
  createParent = false
): Promise<void> {
  const parentPath = dirname(filePath)
  if (createParent) {
    await mkdir(parentPath, { recursive: true })
  } else {
    await stat(parentPath)
  }

  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`

  try {
    try {
      const targetStat = await lstat(filePath)
      if (targetStat.isSymbolicLink()) {
        throw new AppError(
          'WRITE_FAILED',
          '配置路径是符号链接。为避免替换链接，请选择实际配置文件路径。'
        )
      }
      if (!targetStat.isFile()) {
        throw new AppError('WRITE_FAILED', '配置路径不是普通文件，请选择有效文件。')
      }
    } catch (error) {
      if (
        error instanceof AppError ||
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      ) {
        throw error
      }
    }

    await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

export function hashContent(content: string | null): string {
  return createHash('sha256')
    .update(content === null ? 'missing\0' : 'present\0')
    .update(content ?? '')
    .digest('hex')
}

/** Replace a group of app-owned files and roll back the whole group on failure. */
export async function replaceFilesAtomic(files: Record<string, string | null>): Promise<void> {
  const previous = new Map<string, string | null>()
  for (const path of Object.keys(files)) {
    await assertNotSymbolicLink(path)
    previous.set(path, await readOptionalText(path))
  }
  const changed: string[] = []
  try {
    for (const [path, content] of Object.entries(files)) {
      changed.push(path)
      await replaceText(path, content)
      if ((await readOptionalText(path)) !== content) throw new Error('Write verification failed')
    }
  } catch (error) {
    let rollbackFailed = false
    for (const path of changed.reverse()) {
      try {
        if ((await readOptionalText(path)) === previous.get(path)) continue
        await replaceText(path, previous.get(path)!)
        if ((await readOptionalText(path)) !== previous.get(path)) rollbackFailed = true
      } catch {
        rollbackFailed = true
      }
    }
    if (rollbackFailed)
      throw new AppError('ROLLBACK_FAILED', '配置写入失败且回滚未完成，请从本机备份恢复。')
    throw error
  }
}

async function replaceText(path: string, content: string | null): Promise<void> {
  if (content !== null) return writeTextAtomic(path, content, true)
  try {
    await unlink(path)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

export async function assertNotSymbolicLink(filePath: string): Promise<void> {
  try {
    if ((await lstat(filePath)).isSymbolicLink()) {
      throw new AppError(
        'WRITE_FAILED',
        '配置路径是符号链接。为避免替换链接，请选择实际配置文件路径。'
      )
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

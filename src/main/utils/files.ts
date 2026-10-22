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

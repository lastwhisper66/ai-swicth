import { stat } from 'node:fs/promises'
import { shell } from 'electron'
import type { OpenToolLocationInput } from '@shared/ipc'
import { AppError, isFileSystemError } from '../errors'
import type { ResolvedToolPath } from './path-settings'

export async function openToolLocation(
  location: ResolvedToolPath,
  target: OpenToolLocationInput['target']
): Promise<void> {
  const isDirectory = target === 'directory'
  const path = isDirectory ? location.directory : location.path
  try {
    const info = await stat(path)
    if (isDirectory ? !info.isDirectory() : !info.isFile()) {
      throw new AppError('INVALID_INPUT', '配置位置类型不正确，请在配置路径中重新选择目录。')
    }
  } catch (error) {
    if (isFileSystemError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      throw new AppError(
        'PATH_NOT_FOUND',
        isDirectory
          ? '配置目录不存在，请先创建目录或重新选择配置路径。'
          : '配置文件尚不存在，请先应用一个供应商以创建文件。'
      )
    }
    throw error
  }

  const errorMessage = await shell.openPath(path)
  if (errorMessage) {
    throw new AppError(
      'OPEN_FAILED',
      isDirectory
        ? '无法打开配置目录，请检查目录权限后重试。'
        : '无法打开配置文件，请检查文件权限，并在系统中为此文件类型设置默认编辑器后重试。'
    )
  }
}

import type { ApiError, ApiErrorCode } from '@shared/ipc'

export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly fieldErrors?: Record<string, string>

  constructor(code: ApiErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
    }
  }

  if (isFileSystemError(error) && (error.code === 'EACCES' || error.code === 'EPERM')) {
    return {
      code: 'PERMISSION_DENIED',
      message: '没有权限访问配置文件，请检查文件权限后重试。'
    }
  }

  if (isFileSystemError(error)) {
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
      return {
        code: 'WRITE_FAILED',
        message: '数据库被其他进程占用，请关闭占用 ai-switch.db 的程序后重试。'
      }
    if (error.code === 'SQLITE_CORRUPT' || error.code === 'SQLITE_NOTADB')
      return {
        code: 'STORAGE_CORRUPTED',
        message: 'ai-switch.db 无法读取，请从本机数据库备份恢复。'
      }
    if (
      error.code === 'SQLITE_FULL' ||
      error.code === 'SQLITE_READONLY' ||
      error.code === 'SQLITE_CANTOPEN' ||
      error.code?.startsWith('SQLITE_IOERR')
    )
      return {
        code: 'WRITE_FAILED',
        message: '数据库无法读写，请检查应用数据目录权限和磁盘空间后重试。'
      }
  }

  return {
    code: 'UNKNOWN',
    message: '本地操作失败，请重试；如果问题持续，请重新打开应用。'
  }
}

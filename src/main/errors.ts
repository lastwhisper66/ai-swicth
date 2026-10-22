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

  return {
    code: 'UNKNOWN',
    message: '本地操作失败，请重试；如果问题持续，请重新打开应用。'
  }
}

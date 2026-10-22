import { safeStorage } from 'electron'
import { AppError } from '../errors'

export function encryptSecret(value: string): string {
  assertSecureStorageAvailable()
  return safeStorage.encryptString(value).toString('base64')
}

export function decryptSecret(value: string, errorMessage: string): string {
  assertSecureStorageAvailable()
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    throw new AppError('STORAGE_CORRUPTED', errorMessage)
  }
}

export function assertSecureStorageAvailable(): void {
  const insecureLinuxBackend =
    process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'
  if (!safeStorage.isEncryptionAvailable() || insecureLinuxBackend) {
    throw new AppError(
      'SECURE_STORAGE_UNAVAILABLE',
      '系统安全存储当前不可用，无法安全保存 API Key 或备份。'
    )
  }
}

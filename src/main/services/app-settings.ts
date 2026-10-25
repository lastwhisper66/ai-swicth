import type {
  AppSettings,
  AppSettingsInput,
  CloudBackupSettings,
  CloudBackupSettingsInput
} from '@shared/ipc'
import { CLOUD_BACKUP_RETENTION } from '@shared/ipc'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'

interface CloudBackupDocument {
  enabled: boolean
  endpoint: string
  region: string
  bucket: string
  prefix: string
  retentionCount?: number
  accessKeyId: string
  secretAccessKey: string
  encryptionPassword?: string
}

export class AppSettingsStore {
  private settings: AppSettings = {
    closeBehavior: 'quit',
    cloudBackup: defaultCloudBackupSettings()
  }
  private cloudSecretAccessKey = ''

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    const content = await readOptionalText(this.filePath)
    if (content === null) return

    try {
      const value: unknown = JSON.parse(content)
      if (typeof value !== 'object' || value === null || !('version' in value)) {
        throw new Error('Invalid app settings')
      }
      if (
        !('closeBehavior' in value) ||
        (value.closeBehavior !== 'tray' && value.closeBehavior !== 'quit')
      ) {
        throw new Error('Invalid app settings')
      }
      if (
        value.version !== 3 ||
        !('cloudBackup' in value) ||
        !isCloudBackupDocument(value.cloudBackup)
      ) {
        throw new Error('Invalid app settings')
      }
      this.settings = {
        closeBehavior: value.closeBehavior,
        cloudBackup: toPublicCloudBackupSettings(
          value.cloudBackup,
          value.cloudBackup.secretAccessKey.length > 0
        )
      }
      this.cloudSecretAccessKey = value.cloudBackup.secretAccessKey
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '应用设置无法读取，本次关闭窗口将直接退出。请在设置中重新选择关闭行为。'
      )
    }
  }

  get(): AppSettings {
    return {
      closeBehavior: this.settings.closeBehavior,
      cloudBackup: { ...this.settings.cloudBackup }
    }
  }

  async set(settings: AppSettingsInput): Promise<void> {
    await this.saveDocument(settings.closeBehavior, this.settings.cloudBackup)
    this.settings = {
      closeBehavior: settings.closeBehavior,
      cloudBackup: { ...this.settings.cloudBackup }
    }
  }

  async setCloudBackup(input: CloudBackupSettingsInput): Promise<void> {
    if (!isRetentionCount(input.retentionCount)) {
      throw new AppError('INVALID_INPUT', '云端备份保留数量请选择 1、3、5、10 或 20 份。')
    }
    if (input.enabled) {
      if (!input.region.trim() || !input.bucket.trim() || !input.accessKeyId.trim()) {
        throw new AppError(
          'INVALID_INPUT',
          '启用云端备份时，区域、存储桶和 Access Key ID 不能为空。'
        )
      }
      if (input.endpoint.trim()) {
        try {
          const endpoint = new URL(input.endpoint.trim())
          if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:')
            throw new Error('Invalid endpoint')
        } catch {
          throw new AppError('INVALID_INPUT', 'S3 端点必须是有效的 HTTP(S) 地址。')
        }
      }
    }
    const current = this.settings.cloudBackup
    const previousCloudSecret = this.cloudSecretAccessKey
    const next: CloudBackupSettings = {
      enabled: input.enabled,
      endpoint: input.endpoint.trim(),
      region: input.region.trim(),
      bucket: input.bucket.trim(),
      prefix: input.prefix.trim(),
      retentionCount: input.retentionCount,
      accessKeyId: input.accessKeyId.trim(),
      hasSecret: current.hasSecret,
      maskedSecret: current.maskedSecret,
      encryptionPassword: current.encryptionPassword
    }
    if (input.secretAccessKey.mode === 'replace') {
      if (!input.secretAccessKey.value.trim() || input.secretAccessKey.value.length > 4096) {
        throw new AppError('INVALID_INPUT', 'Secret Access Key 不能为空且不能超过 4096 个字符。')
      }
      this.cloudSecretAccessKey = input.secretAccessKey.value
      next.hasSecret = true
      next.maskedSecret = maskSecret(input.secretAccessKey.value)
    } else if (input.secretAccessKey.mode === 'clear') {
      this.cloudSecretAccessKey = ''
      next.hasSecret = false
      next.maskedSecret = ''
    }
    try {
      await this.saveDocument(this.settings.closeBehavior, next)
    } catch (error) {
      this.cloudSecretAccessKey = previousCloudSecret
      throw error
    }
    this.settings = { closeBehavior: this.settings.closeBehavior, cloudBackup: next }
  }

  getCloudBackupCredentials(): {
    settings: CloudBackupSettings
    secretAccessKey: string
  } {
    return {
      settings: { ...this.settings.cloudBackup },
      secretAccessKey: this.cloudSecretAccessKey
    }
  }

  async setCloudBackupPassword(password: string): Promise<void> {
    if (
      typeof password !== 'string' ||
      (password.length > 0 && password.length < 8) ||
      password.length > 256 ||
      /[\r\n]/u.test(password)
    ) {
      throw new AppError(
        'INVALID_INPUT',
        '备份密码应为 8 到 256 个字符且不能包含换行，或留空清除。'
      )
    }
    if (password === this.settings.cloudBackup.encryptionPassword) return
    const next = { ...this.settings.cloudBackup, encryptionPassword: password }
    await this.saveDocument(this.settings.closeBehavior, next)
    this.settings = { ...this.settings, cloudBackup: next }
  }

  private async saveDocument(
    closeBehavior: AppSettings['closeBehavior'],
    cloudBackup: CloudBackupSettings
  ): Promise<void> {
    await writeTextAtomic(
      this.filePath,
      `${JSON.stringify(
        {
          version: 3,
          closeBehavior,
          cloudBackup: {
            enabled: cloudBackup.enabled,
            endpoint: cloudBackup.endpoint,
            region: cloudBackup.region,
            bucket: cloudBackup.bucket,
            prefix: cloudBackup.prefix,
            retentionCount: cloudBackup.retentionCount,
            accessKeyId: cloudBackup.accessKeyId,
            secretAccessKey: this.cloudSecretAccessKey,
            encryptionPassword: cloudBackup.encryptionPassword
          }
        },
        null,
        2
      )}\n`,
      true
    )
  }
}

function defaultCloudBackupSettings(): CloudBackupSettings {
  return {
    enabled: false,
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    prefix: 'ai-switch',
    retentionCount: CLOUD_BACKUP_RETENTION.defaultCount,
    accessKeyId: '',
    hasSecret: false,
    maskedSecret: '',
    encryptionPassword: ''
  }
}

function maskSecret(value: string): string {
  if (value.length < 8) return '••••••••'
  return `${value.slice(0, 3)}…${value.slice(-3)}`
}

function isCloudBackupDocument(value: unknown): value is CloudBackupDocument {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  return (
    typeof input.enabled === 'boolean' &&
    typeof input.endpoint === 'string' &&
    typeof input.region === 'string' &&
    typeof input.bucket === 'string' &&
    typeof input.prefix === 'string' &&
    (input.retentionCount === undefined || isRetentionCount(input.retentionCount)) &&
    typeof input.accessKeyId === 'string' &&
    typeof input.secretAccessKey === 'string' &&
    (input.encryptionPassword === undefined || typeof input.encryptionPassword === 'string')
  )
}

function toPublicCloudBackupSettings(
  value: CloudBackupDocument,
  hasSecret: boolean
): CloudBackupSettings {
  return {
    enabled: value.enabled,
    endpoint: value.endpoint,
    region: value.region,
    bucket: value.bucket,
    prefix: value.prefix,
    retentionCount: value.retentionCount ?? CLOUD_BACKUP_RETENTION.defaultCount,
    accessKeyId: value.accessKeyId,
    hasSecret,
    maskedSecret: hasSecret ? '••••••••' : '',
    encryptionPassword: value.encryptionPassword ?? ''
  }
}

function isRetentionCount(value: unknown): value is number {
  return (
    typeof value === 'number' && CLOUD_BACKUP_RETENTION.options.some((count) => count === value)
  )
}

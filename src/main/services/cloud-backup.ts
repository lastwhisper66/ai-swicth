import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import type {
  CloudBackupConnectionResult,
  CloudBackupOperationResult,
  CloudBackupSettings,
  CloudBackupSettingsInput
} from '@shared/ipc'
import { PROVIDER_TOOL_IDS, TOOL_IDS, isWslTool, type ToolId } from '@shared/ipc'
import { parseConfiguration, type ManagedState } from '@shared/configuration'
import { AppError } from '../errors'
import type { PortableProvider, ProviderStore } from '../providers/store'
import type { AppSettingsStore } from './app-settings'
import type { CommonConfigStore } from './common-config'
import type { ManagedStateStore } from './managed-state'

const CLOUD_DOCUMENT_VERSION = 3
const ENVELOPE_VERSION = 1
const LEGACY_OBJECT_NAME = 'backup.v1.json.enc'
const PASSWORD_MIN_LENGTH = 8

interface CloudBackupDocument {
  version: 1 | 2 | 3
  createdAt: string
  providers: PortableProvider[]
  commonConfigs: Record<ToolId, string | null>
  managedStates?: Record<ToolId, ManagedState | null>
}

interface EncryptedEnvelope {
  version: typeof ENVELOPE_VERSION
  algorithm: 'aes-256-gcm'
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

interface CloudBackupObject {
  key: string
  lastModified: number
}

export class CloudBackupService {
  constructor(
    private readonly providerStore: ProviderStore,
    private readonly commonConfigs: CommonConfigStore,
    private readonly appSettings: AppSettingsStore,
    private readonly managedStates: ManagedStateStore
  ) {}

  async testConnection(input: CloudBackupSettingsInput): Promise<CloudBackupConnectionResult> {
    const { client, settings } = this.getClient(input)
    try {
      await client.send(new HeadBucketCommand({ Bucket: settings.bucket }))
      await this.listBackups(client, settings)
      return { message: 'S3 兼容存储连接成功。' }
    } catch (error) {
      throw this.mapCloudError(error, '无法连接 S3 兼容存储，请检查地址、存储桶和凭据。')
    } finally {
      client.destroy()
    }
  }

  async upload(encryptionPassword: string): Promise<CloudBackupOperationResult> {
    assertEncryptionPassword(encryptionPassword)
    const { client, settings } = this.getClient()
    try {
      const document: CloudBackupDocument = {
        version: CLOUD_DOCUMENT_VERSION,
        createdAt: new Date().toISOString(),
        providers: await this.providerStore.exportPortable(),
        commonConfigs: await this.commonConfigs.exportPortable(),
        managedStates: await this.managedStates.exportPortable()
      }
      const objectKey = `${getObjectPrefix(settings)}backups/${document.createdAt.replace(/[:.]/gu, '-')}-${randomUUID()}.v${CLOUD_DOCUMENT_VERSION}.json.enc`
      await client.send(
        new PutObjectCommand({
          Bucket: settings.bucket,
          Key: objectKey,
          Body: encryptDocument(document, encryptionPassword),
          ContentType: 'application/octet-stream',
          Metadata: { 'ai-switch-version': String(CLOUD_DOCUMENT_VERSION) }
        })
      )
      const warnings: string[] = []
      try {
        await this.pruneBackups(client, settings, objectKey)
      } catch (error) {
        warnings.push(
          error instanceof AppError
            ? error.message
            : '备份保留数量未能核实，本次上传已完成；请检查网络后重试。'
        )
      }
      return {
        objectKey,
        createdAt: document.createdAt,
        providerCount: document.providers.length,
        commonConfigCount: PROVIDER_TOOL_IDS.filter(
          (toolId) => document.commonConfigs[toolId] !== null
        ).length,
        message:
          warnings.length > 0
            ? '已将供应商配置和共通配置加密上传到云端。'
            : `已加密上传配置，云端最多保留最近 ${settings.retentionCount} 份备份。`,
        warnings
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw this.mapCloudError(error, '云端备份上传失败，请检查网络和存储配置。')
    } finally {
      client.destroy()
    }
  }

  async restore(encryptionPassword: string): Promise<CloudBackupOperationResult> {
    assertEncryptionPassword(encryptionPassword)
    const { client, settings } = this.getClient()
    try {
      const backups = await this.listBackups(client, settings)
      const latest = backups.sort(compareBackups).at(-1)
      if (!latest) {
        throw new AppError(
          'CLOUD_BACKUP_INVALID',
          '云端还没有找到 AI Switch 备份，请先上传一份备份。'
        )
      }
      const objectKey = latest.key
      const response = await client.send(
        new GetObjectCommand({ Bucket: settings.bucket, Key: objectKey })
      )
      if (!response.Body || typeof response.Body.transformToString !== 'function') {
        throw new AppError('CLOUD_BACKUP_INVALID', '云端备份正文为空或格式不受支持。')
      }
      const encrypted = await response.Body.transformToString()
      const document = decryptDocument(encrypted, encryptionPassword)
      // Validate every payload before replacing any local file, including legacy templates.
      try {
        document.providers = this.providerStore.validatePortable(document.providers)
        for (const toolId of TOOL_IDS) {
          const common = document.commonConfigs[toolId]
          if (common !== null) parseConfiguration(toolId, common)
          const state = document.managedStates?.[toolId]
          if (state !== undefined && state !== null)
            this.managedStates.decode(JSON.stringify(state))
          if (state?.common !== undefined) parseConfiguration(toolId, state.common)
        }
        document.commonConfigs = this.commonConfigs.normalizePortable(document.commonConfigs)
      } catch {
        throw new AppError(
          'CLOUD_BACKUP_INVALID',
          '云端备份包含无效的供应商、共通配置或接管状态，未修改本地配置。'
        )
      }
      const previousProviders = await this.providerStore.exportPortable()
      const previousCommonConfigs = await this.commonConfigs.exportPortable()
      const previousManagedStates = await this.managedStates.exportPortable()
      try {
        await this.providerStore.importPortable(document.providers)
        await this.commonConfigs.importPortable(document.commonConfigs)
        await this.managedStates.importPortable(document.managedStates!)
      } catch (error) {
        try {
          await this.providerStore.importPortable(previousProviders)
          await this.commonConfigs.importPortable(previousCommonConfigs)
          await this.managedStates.importPortable(previousManagedStates)
        } catch {
          throw new AppError(
            'ROLLBACK_FAILED',
            '云端恢复失败且本地回滚未完成，请重新打开应用检查配置。'
          )
        }
        throw error
      }
      return {
        objectKey,
        createdAt: document.createdAt,
        providerCount: document.providers.length,
        commonConfigCount: PROVIDER_TOOL_IDS.filter(
          (toolId) => document.commonConfigs[toolId] !== null
        ).length,
        message: `已从最新云端备份恢复 ${document.providers.length} 个供应商、模型预设和共通配置，请手动应用到对应工具。`,
        warnings: []
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw this.mapCloudError(error, '云端备份下载失败，请检查网络和存储配置。')
    } finally {
      client.destroy()
    }
  }

  private async listBackups(
    client: S3Client,
    settings: CloudBackupSettings
  ): Promise<CloudBackupObject[]> {
    const prefix = getObjectPrefix(settings)
    const backups: CloudBackupObject[] = []
    let continuationToken: string | undefined
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: settings.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      )
      for (const object of response.Contents ?? []) {
        if (object.Key && isBackupKey(object.Key, prefix)) {
          backups.push({ key: object.Key, lastModified: object.LastModified?.getTime() ?? 0 })
        }
      }
      if (
        response.IsTruncated &&
        (!response.NextContinuationToken || response.NextContinuationToken === continuationToken)
      ) {
        throw new AppError('CLOUD_UNAVAILABLE', '无法完整列出云端备份，请重试。')
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)
    return backups
  }

  private async pruneBackups(
    client: S3Client,
    settings: CloudBackupSettings,
    uploadedKey: string
  ): Promise<void> {
    let backups: CloudBackupObject[]
    try {
      backups = await this.listBackups(client, settings)
    } catch (error) {
      throw new AppError(
        'CLOUD_UNAVAILABLE',
        `备份列表读取失败，尚未核实保留数量，未执行清理。${describeCloudFailure(error, 'list')}`
      )
    }
    const previousBackups = backups
      .filter((backup) => backup.key !== uploadedKey)
      .sort(compareBackups)
    const excessCount = Math.max(0, previousBackups.length + 1 - settings.retentionCount)
    const expiredBackups = previousBackups.slice(0, excessCount)
    if (expiredBackups.length === 0) return
    try {
      await this.deleteBackups(client, settings, expiredBackups)
    } catch (error) {
      throw new AppError(
        'CLOUD_UNAVAILABLE',
        `已核实备份列表，但旧备份清理未完成；新上传的备份已保留。${describeCloudFailure(error, 'delete')}`
      )
    }
  }

  private async deleteBackups(
    client: S3Client,
    settings: CloudBackupSettings,
    backups: CloudBackupObject[]
  ): Promise<void> {
    for (let offset = 0; offset < backups.length; offset += 1000) {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: settings.bucket,
          Delete: {
            Objects: backups.slice(offset, offset + 1000).map((backup) => ({ Key: backup.key })),
            Quiet: true
          }
        })
      )
      if (response.Errors?.length) {
        throw new AppError(
          'CLOUD_UNAVAILABLE',
          `存储服务未能删除 ${response.Errors.length} 个旧备份。${describeCloudFailure(response.Errors[0], 'delete')}`
        )
      }
    }
  }

  private getClient(input?: CloudBackupSettingsInput): {
    client: S3Client
    settings: CloudBackupSettings
  } {
    const credentials = this.appSettings.getCloudBackupCredentials(input)
    const settings = credentials.settings
    if (!settings.enabled) {
      throw new AppError('CLOUD_NOT_CONFIGURED', '请先启用并保存 S3 兼容云端备份。')
    }
    if (
      !settings.bucket ||
      !settings.region ||
      !settings.accessKeyId ||
      !credentials.secretAccessKey
    ) {
      throw new AppError(
        'CLOUD_NOT_CONFIGURED',
        '请完整填写存储桶、区域、Access Key 和 Secret Key。'
      )
    }
    if (settings.endpoint) {
      try {
        const url = new URL(settings.endpoint)
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
          throw new Error('Invalid endpoint')
      } catch {
        throw new AppError('CLOUD_NOT_CONFIGURED', 'S3 端点必须是有效的 HTTP(S) 地址。')
      }
    }
    const client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint || undefined,
      forcePathStyle: Boolean(settings.endpoint),
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    })
    return { client, settings }
  }

  private mapCloudError(error: unknown, fallback: string): AppError {
    if (error instanceof AppError) return error
    const name = error instanceof Error ? error.name : ''
    if (name === 'NoSuchKey' || name === 'NotFound') {
      return new AppError(
        'CLOUD_BACKUP_INVALID',
        '云端还没有找到 AI Switch 备份，请先上传一份备份。'
      )
    }
    if (name === 'AccessDenied' || name === 'Forbidden') {
      return new AppError(
        'CLOUD_UNAVAILABLE',
        '云端访问被拒绝，请检查凭据及存储桶的列出、读取、写入和删除权限。'
      )
    }
    return new AppError('CLOUD_UNAVAILABLE', fallback)
  }
}

function assertEncryptionPassword(password: string): void {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > 256 ||
    /[\r\n]/u.test(password)
  ) {
    throw new AppError(
      'INVALID_INPUT',
      `云端备份密码长度应为 ${PASSWORD_MIN_LENGTH} 到 256 个字符，且不能包含换行。`
    )
  }
}

function getObjectPrefix(settings: CloudBackupSettings): string {
  const prefix = settings.prefix.trim().replace(/^\/+|\/+$/gu, '')
  if (!prefix || prefix.includes('..') || hasControlCharacters(prefix)) {
    throw new AppError('CLOUD_NOT_CONFIGURED', '云端备份前缀无效。')
  }
  return `${prefix}/`
}

function isBackupKey(key: string, prefix: string): boolean {
  if (!key.startsWith(prefix)) return false
  const relativeKey = key.slice(prefix.length)
  return (
    relativeKey === LEGACY_OBJECT_NAME ||
    (relativeKey.startsWith('backups/') && /\.v[123]\.json\.enc$/u.test(relativeKey))
  )
}

function compareBackups(left: CloudBackupObject, right: CloudBackupObject): number {
  return left.lastModified - right.lastModified || left.key.localeCompare(right.key)
}

function describeCloudFailure(error: unknown, action: 'list' | 'delete'): string {
  if (error instanceof AppError) return error.message
  const details =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const code = details.Code ?? details.name
  const metadata =
    typeof details.$metadata === 'object' && details.$metadata !== null
      ? (details.$metadata as Record<string, unknown>)
      : {}
  const status = metadata.httpStatusCode
  if (code === 'AccessDenied' || code === 'Forbidden' || status === 403) {
    const permission = action === 'delete' ? '删除' : '备份列表'
    return `存储服务拒绝访问，请检查${permission}权限。`
  }
  if (
    code === 'NotImplemented' ||
    code === 'NotSupported' ||
    code === 'MethodNotAllowed' ||
    status === 405 ||
    status === 501
  ) {
    return `存储服务不支持${action === 'delete' ? '批量删除' : '备份列表'}接口，请检查 S3 兼容性。`
  }
  if (code === 'NoSuchBucket' || status === 404) return '未找到存储桶，请检查存储桶名称和端点。'
  if (code === 'TimeoutError' || code === 'AbortError' || code === 'RequestTimeout') {
    return '请求超时，请检查网络后重试。'
  }
  return typeof status === 'number'
    ? `存储服务返回 HTTP ${status}，请检查端点和网络后重试。`
    : '请求未完成，请检查端点和网络后重试。'
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function encryptDocument(document: CloudBackupDocument, password: string): string {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(document), 'utf8'),
    cipher.final()
  ])
  const envelope: EncryptedEnvelope = {
    version: ENVELOPE_VERSION,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
  return JSON.stringify(envelope)
}

function decryptDocument(encrypted: string, password: string): CloudBackupDocument {
  try {
    const value: unknown = JSON.parse(encrypted)
    if (!isEnvelope(value)) throw new Error('Invalid envelope')
    const key = scryptSync(password, Buffer.from(value.salt, 'base64'), 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    })
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
    const document: unknown = JSON.parse(plaintext)
    if (!isCloudBackupDocument(document)) throw new Error('Invalid backup document')
    // Older documents predate WSL. Normalize missing entries before validation and import.
    document.managedStates ??= {} as Record<ToolId, ManagedState | null>
    for (const toolId of TOOL_IDS) {
      document.commonConfigs[toolId] ??= null
      document.managedStates[toolId] ??= null
    }
    return document
  } catch {
    throw new AppError(
      'CLOUD_BACKUP_INVALID',
      '云端备份无法解密或校验失败，请确认输入了相同的备份密码。'
    )
  }
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  return (
    input.version === ENVELOPE_VERSION &&
    input.algorithm === 'aes-256-gcm' &&
    input.kdf === 'scrypt' &&
    typeof input.salt === 'string' &&
    typeof input.iv === 'string' &&
    typeof input.tag === 'string' &&
    typeof input.ciphertext === 'string'
  )
}

function isCloudBackupDocument(value: unknown): value is CloudBackupDocument {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  if (
    ![1, 2, CLOUD_DOCUMENT_VERSION].includes(input.version as number) ||
    typeof input.createdAt !== 'string' ||
    !Array.isArray(input.providers) ||
    typeof input.commonConfigs !== 'object' ||
    input.commonConfigs === null ||
    Array.isArray(input.commonConfigs)
  ) {
    return false
  }
  if (
    (input.version !== 1 || input.managedStates !== undefined) &&
    (typeof input.managedStates !== 'object' ||
      input.managedStates === null ||
      Array.isArray(input.managedStates) ||
      !TOOL_IDS.filter((toolId) => input.version === 3 || !isWslTool(toolId)).every((toolId) =>
        Object.hasOwn(input.managedStates as object, toolId)
      ))
  )
    return false
  const commonConfigs = input.commonConfigs as Record<string, unknown>
  if (
    !TOOL_IDS.every(
      (toolId) =>
        (input.version !== 3 && isWslTool(toolId) && !Object.hasOwn(commonConfigs, toolId)) ||
        commonConfigs[toolId] === null ||
        typeof commonConfigs[toolId] === 'string'
    )
  ) {
    return false
  }
  return input.providers.every(isPortableProvider)
}

function isPortableProvider(value: unknown): value is PortableProvider {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  return (
    typeof input.id === 'string' &&
    typeof input.name === 'string' &&
    typeof input.baseUrl === 'string' &&
    typeof input.apiKey === 'string' &&
    Array.isArray(input.tools) &&
    input.tools.every((toolId) => TOOL_IDS.includes(toolId as ToolId)) &&
    ((typeof input.models === 'object' && input.models !== null) ||
      (typeof input.configurations === 'object' && input.configurations !== null)) &&
    typeof input.createdAt === 'string' &&
    typeof input.updatedAt === 'string'
  )
}

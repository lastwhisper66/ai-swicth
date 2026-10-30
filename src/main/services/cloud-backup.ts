import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import type { HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import type {
  CloudBackupConnectionResult,
  CloudBackupOperationResult,
  CloudBackupSettings,
  CloudBackupSettingsInput,
  CloudBackupSummary,
  ConfigurationBackupSummary,
  ProviderToolId,
  ToolId
} from '@shared/ipc'
import { PROVIDER_TOOL_IDS } from '@shared/ipc'
import { isObject } from '@shared/configuration'
import { AppError } from '../errors'
import type { PortableProvider, ProviderStore } from '../providers/store'
import type { AppDatabase } from '../database'
import type { AppSettingsStore } from './app-settings'
import type { CommonConfigStore } from './common-config'
import type { ConfigurationArchiveStore } from './configuration-archives'

const CURRENT_OBJECT_NAME = 'backup.json.enc'
const LEGACY_OBJECT_NAME = 'backup.v1.json.enc'

interface CloudBackupDocument {
  createdAt: string
  providers: PortableProvider[]
  commonConfigs: Record<ProviderToolId, string | null>
}
interface EncryptedEnvelope {
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
    private readonly archives: ConfigurationArchiveStore,
    private readonly database: AppDatabase
  ) {}

  async testConnection(input: CloudBackupSettingsInput): Promise<CloudBackupConnectionResult> {
    const { client, settings } = this.getClient(input)
    try {
      await client.send(new HeadBucketCommand({ Bucket: settings.bucket }))
      await this.listBackups(client, settings)
      return { message: 'S3 兼容存储连接成功，绑定不会自动上传或应用存档。' }
    } catch (error) {
      throw this.mapCloudError(error, '无法连接 S3 兼容存储，请检查地址、存储桶和凭据。')
    } finally {
      client.destroy()
    }
  }

  async list(): Promise<CloudBackupSummary[]> {
    const { client, settings } = this.getClient()
    try {
      const current = await this.readCurrentMetadata(client, settings)
      const objects = (await this.listBackups(client, settings)).sort(compareBackups).reverse()
      const currentKey = `${getObjectPrefix(settings)}${CURRENT_OBJECT_NAME}`
      const result = objects
        .filter(
          (item) => item.key !== currentKey && item.key !== current?.Metadata?.['archive-key']
        )
        .map((item, index) => ({
          objectKey: item.key,
          createdAt: new Date(item.lastModified).toISOString(),
          current: !current && index === 0
        }))
      if (current)
        result.unshift({
          objectKey: objects.some((item) => item.key === current.Metadata?.['archive-key'])
            ? current.Metadata!['archive-key']
            : currentKey,
          createdAt: (current.LastModified ?? new Date()).toISOString(),
          current: true
        })
      return result
    } catch (error) {
      throw this.mapCloudError(error, '云端存档列表读取失败，请检查网络后重试。')
    } finally {
      client.destroy()
    }
  }

  async upload(encryptionPassword: string): Promise<CloudBackupOperationResult> {
    assertEncryptionPassword(encryptionPassword)
    const { client, settings } = this.getClient()
    try {
      const snapshot = this.database.readTransaction(() => ({
        common: this.commonConfigs.exportPortableSync(),
        providers: this.providerStore.exportPortableSync()
      }))
      const common = snapshot.common
      const document: CloudBackupDocument = {
        createdAt: new Date().toISOString(),
        providers: snapshot.providers,
        commonConfigs: Object.fromEntries(
          PROVIDER_TOOL_IDS.map((id) => [id, common[id]])
        ) as CloudBackupDocument['commonConfigs']
      }
      this.validateDocument(document)
      const body = encryptDocument(document, encryptionPassword)
      const objectKey = `${getObjectPrefix(settings)}${CURRENT_OBJECT_NAME}`
      const archiveKey = `${getObjectPrefix(settings)}backups/${document.createdAt.replace(/[:.]/gu, '-')}-${randomUUID()}.json.enc`
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: settings.bucket,
            Key: objectKey,
            Body: body,
            ContentType: 'application/octet-stream',
            Metadata: { 'archive-key': archiveKey }
          })
        )
      } catch (error) {
        const status =
          isObject(error) && isObject(error.$metadata) ? error.$metadata.httpStatusCode : undefined
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408)
          throw this.mapCloudError(error, '云端保存被拒绝，原存档未覆盖。')
        // A dropped response does not prove that S3 rejected the atomic PUT.
        const confirmed = await this.readCurrentMetadata(client, settings).catch(() => null)
        if (confirmed?.Metadata?.['archive-key'] !== archiveKey)
          throw new AppError(
            'CLOUD_UNAVAILABLE',
            `云端保存结果待确认，请刷新存档列表后检查，再决定是否重新保存。${describeCloudFailure(error)}`
          )
      }
      const warnings: string[] = []
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: settings.bucket,
            Key: archiveKey,
            Body: body,
            ContentType: 'application/octet-stream'
          })
        )
        await this.pruneBackups(client, settings, archiveKey)
      } catch {
        warnings.push('云端当前存档已覆盖，但历史记录保存或清理未完成，请检查网络和存储权限。')
      }
      return {
        objectKey,
        createdAt: document.createdAt,
        providerCount: document.providers.length,
        commonConfigCount: PROVIDER_TOOL_IDS.filter((id) => common[id] !== null).length,
        message: '已用本地完整配置覆盖云端当前存档，API Key 已随文件加密保存。',
        warnings
      }
    } catch (error) {
      throw this.mapCloudError(error, '云端保存失败，请检查网络和存储配置。')
    } finally {
      client.destroy()
    }
  }

  async restore(
    encryptionPassword: string,
    selectedKey?: string
  ): Promise<CloudBackupOperationResult> {
    assertEncryptionPassword(encryptionPassword)
    const { client, settings } = this.getClient()
    try {
      const prefix = getObjectPrefix(settings)
      let objectKey = selectedKey
      if (objectKey && !isBackupKey(objectKey, prefix))
        throw new AppError('INVALID_INPUT', '请选择当前云端目录中的有效存档。')
      if (!objectKey) {
        const current = await this.readCurrentMetadata(client, settings)
        objectKey = current
          ? `${prefix}${CURRENT_OBJECT_NAME}`
          : (await this.listBackups(client, settings)).sort(compareBackups).at(-1)?.key
      }
      if (!objectKey)
        throw new AppError('CLOUD_BACKUP_INVALID', '云端还没有存档，请先保存一份配置。')
      const response = await client.send(
        new GetObjectCommand({ Bucket: settings.bucket, Key: objectKey })
      )
      if (!response.Body || typeof response.Body.transformToString !== 'function')
        throw new AppError('CLOUD_BACKUP_INVALID', '云端存档正文为空，未修改本地配置。')
      // One GET pins the selected object contents for this restore, even if another device uploads.
      const document = this.validateDocument(
        decryptDocument(await response.Body.transformToString(), encryptionPassword)
      )
      await this.applyDocument(document, 'cloud')
      return {
        objectKey,
        createdAt: document.createdAt,
        providerCount: document.providers.length,
        commonConfigCount: PROVIDER_TOOL_IDS.filter((id) => document.commonConfigs[id] !== null)
          .length,
        message: '已用云端存档完整覆盖本地供应商和通用配置，本地变更未合并；请手动应用到工具。',
        warnings: []
      }
    } catch (error) {
      throw this.mapCloudError(error, '云端存档应用失败，请检查网络和目录权限。')
    } finally {
      client.destroy()
    }
  }

  listLocalBackups(): Promise<ConfigurationBackupSummary[]> {
    return this.archives.list()
  }

  async restoreLocal(backupId: string): Promise<void> {
    const archive = await this.archives.read(backupId)
    if (archive.reason === 'migration')
      throw new AppError('INVALID_INPUT', '迁移原始备份请从应用数据目录找回。')
    const providers = archive.files['providers.json']
    let parsed: unknown
    try {
      parsed = providers === null ? { providers: [] } : JSON.parse(providers)
    } catch {
      throw new AppError('STORAGE_CORRUPTED', '本机配置快照中的供应商数据无法解析。')
    }
    if (!isObject(parsed) || !Array.isArray(parsed.providers))
      throw new AppError('STORAGE_CORRUPTED', '本机配置快照缺少供应商资料。')
    const commonConfigs = Object.fromEntries(
      PROVIDER_TOOL_IDS.map((id) => {
        const name = `${id}.common.json`
        if (!Object.hasOwn(archive.files, name))
          throw new AppError('STORAGE_CORRUPTED', '本机配置快照缺少通用模板。')
        return [id, this.commonConfigs.decode(archive.files[name])]
      })
    ) as CloudBackupDocument['commonConfigs']
    await this.applyDocument(
      this.validateDocument({
        createdAt: archive.createdAt,
        providers: parsed.providers,
        commonConfigs
      }),
      'restore'
    )
  }

  private validateDocument(value: unknown): CloudBackupDocument {
    if (
      !isObject(value) ||
      (value.version !== undefined && ![1, 2, 3].includes(value.version as number)) ||
      typeof value.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      !Array.isArray(value.providers) ||
      !isObject(value.commonConfigs)
    )
      throw new AppError('CLOUD_BACKUP_INVALID', '存档缺少完整配置或格式无效，未修改本地配置。')
    try {
      const providers = this.providerStore.validatePortable(value.providers)
      const common = this.commonConfigs.normalizePortable(
        value.commonConfigs as Partial<Record<ToolId, string | null>>
      )
      return {
        createdAt: value.createdAt,
        providers,
        commonConfigs: Object.fromEntries(
          PROVIDER_TOOL_IDS.map((id) => [id, common[id]])
        ) as CloudBackupDocument['commonConfigs']
      }
    } catch {
      throw new AppError('CLOUD_BACKUP_INVALID', '存档中的供应商或通用模板无效，未修改本地配置。')
    }
  }

  private async applyDocument(
    document: CloudBackupDocument,
    reason: 'cloud' | 'restore'
  ): Promise<void> {
    const previous = await this.archives.capturePortable()
    const backup = await this.archives.prepare(previous, reason)
    this.database.transaction(() => {
      if (JSON.stringify(this.archives.capturePortableSync()) !== JSON.stringify(previous))
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '本地配置已在备份期间改变，未执行覆盖，请重试。'
        )
      this.archives.register(backup)
      this.providerStore.replacePortable(document.providers)
      this.commonConfigs.replacePortable(document.commonConfigs)
    })
  }

  private async readCurrentMetadata(
    client: S3Client,
    settings: CloudBackupSettings
  ): Promise<HeadObjectCommandOutput | null> {
    try {
      return await client.send(
        new HeadObjectCommand({
          Bucket: settings.bucket,
          Key: `${getObjectPrefix(settings)}${CURRENT_OBJECT_NAME}`
        })
      )
    } catch (error) {
      if (
        isObject(error) &&
        (error.name === 'NotFound' ||
          error.name === 'NoSuchKey' ||
          (isObject(error.$metadata) && error.$metadata.httpStatusCode === 404))
      )
        return null
      throw error
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
        if (object.Key && isBackupKey(object.Key, prefix))
          backups.push({ key: object.Key, lastModified: object.LastModified?.getTime() ?? 0 })
      }
      if (
        response.IsTruncated &&
        (!response.NextContinuationToken || response.NextContinuationToken === continuationToken)
      )
        throw new AppError('CLOUD_UNAVAILABLE', '无法完整列出云端存档，请重试。')
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)
    return backups
  }

  private async pruneBackups(
    client: S3Client,
    settings: CloudBackupSettings,
    uploadedKey: string
  ): Promise<void> {
    const current = await this.readCurrentMetadata(client, settings)
    // Another device may have committed since this upload. Its cleanup owns the current policy.
    if (current?.Metadata?.['archive-key'] !== uploadedKey) return
    const currentKey = `${getObjectPrefix(settings)}${CURRENT_OBJECT_NAME}`
    const previous = (await this.listBackups(client, settings))
      .filter((item) => item.key !== uploadedKey && item.key !== currentKey)
      .sort(compareBackups)
    const expired = previous.slice(0, Math.max(0, previous.length + 1 - settings.retentionCount))
    for (let offset = 0; offset < expired.length; offset += 1000) {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: settings.bucket,
          Delete: {
            Objects: expired.slice(offset, offset + 1000).map((item) => ({ Key: item.key })),
            Quiet: true
          }
        })
      )
      if (response.Errors?.length)
        throw new AppError('CLOUD_UNAVAILABLE', '旧存档清理未完成，请检查删除权限。')
    }
  }

  private getClient(input?: CloudBackupSettingsInput): {
    client: S3Client
    settings: CloudBackupSettings
  } {
    const { settings, secretAccessKey } = this.appSettings.getCloudBackupCredentials(input)
    if (!settings.enabled)
      throw new AppError('CLOUD_NOT_CONFIGURED', '请先启用并保存云端备份设置。')
    if (!settings.bucket || !settings.region || !settings.accessKeyId || !secretAccessKey)
      throw new AppError(
        'CLOUD_NOT_CONFIGURED',
        '请完整填写存储桶、区域、Access Key 和 Secret Key。'
      )
    if (settings.endpoint) {
      try {
        if (!['http:', 'https:'].includes(new URL(settings.endpoint).protocol))
          throw new Error('Invalid endpoint')
      } catch {
        throw new AppError('CLOUD_NOT_CONFIGURED', 'S3 端点必须是有效的 HTTP(S) 地址。')
      }
    }
    getObjectPrefix(settings)
    return {
      settings,
      client: new S3Client({
        region: settings.region,
        endpoint: settings.endpoint || undefined,
        forcePathStyle: Boolean(settings.endpoint),
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
        credentials: { accessKeyId: settings.accessKeyId, secretAccessKey }
      })
    }
  }

  private mapCloudError(error: unknown, fallback: string): AppError {
    if (error instanceof AppError) return error
    if (isObject(error) && (error.code === 'EACCES' || error.code === 'EPERM'))
      return new AppError(
        'PERMISSION_DENIED',
        '没有权限写入本地配置，或文件正在被占用；请检查目录权限并关闭占用文件的程序后重试。'
      )
    if (isObject(error) && (error.name === 'NoSuchKey' || error.name === 'NotFound'))
      return new AppError('CLOUD_BACKUP_INVALID', '所选云端存档不存在，请刷新列表。')
    return new AppError('CLOUD_UNAVAILABLE', `${fallback}${describeCloudFailure(error)}`)
  }
}

function assertEncryptionPassword(password: string): void {
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 256 ||
    /[\r\n]/u.test(password)
  )
    throw new AppError('INVALID_INPUT', '云端备份密码应为 8 到 256 个字符，且不能包含换行。')
}
function getObjectPrefix(settings: CloudBackupSettings): string {
  const prefix = settings.prefix.trim().replace(/^\/+|\/+$/gu, '')
  if (
    !prefix ||
    prefix.includes('..') ||
    Array.from(prefix).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    throw new AppError('CLOUD_NOT_CONFIGURED', '云端备份前缀无效。')
  return `${prefix}/`
}
function isBackupKey(key: string, prefix: string): boolean {
  if (!key.startsWith(prefix)) return false
  const relative = key.slice(prefix.length)
  return (
    relative === CURRENT_OBJECT_NAME ||
    relative === LEGACY_OBJECT_NAME ||
    /^backups\/[^/]+(?:\.v[123])?\.json\.enc$/u.test(relative)
  )
}
function compareBackups(a: CloudBackupObject, b: CloudBackupObject): number {
  return a.lastModified - b.lastModified || a.key.localeCompare(b.key)
}
function describeCloudFailure(error: unknown): string {
  const details = isObject(error) ? error : {}
  const status = isObject(details.$metadata) ? details.$metadata.httpStatusCode : undefined
  if (status === 403 || details.name === 'AccessDenied')
    return '请检查存储桶的列出、读取、写入和删除权限。'
  if (status === 404 || details.name === 'NoSuchBucket')
    return '未找到存储桶或对象，请刷新列表并检查端点。'
  return '请检查网络和 S3 兼容存储设置后重试。'
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
  return JSON.stringify({
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  } satisfies EncryptedEnvelope)
}
function decryptDocument(encrypted: string, password: string): unknown {
  try {
    const value: unknown = JSON.parse(encrypted)
    if (
      !isObject(value) ||
      (value.version !== undefined && value.version !== 1) ||
      value.algorithm !== 'aes-256-gcm' ||
      value.kdf !== 'scrypt' ||
      !['salt', 'iv', 'tag', 'ciphertext'].every((key) => typeof value[key] === 'string')
    )
      throw new Error('Invalid envelope')
    const envelope = value as unknown as EncryptedEnvelope
    const salt = Buffer.from(envelope.salt, 'base64')
    const iv = Buffer.from(envelope.iv, 'base64')
    const tag = Buffer.from(envelope.tag, 'base64')
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16)
      throw new Error('Invalid encryption parameters')
    const key = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final()
      ]).toString('utf8')
    )
  } catch {
    throw new AppError(
      'CLOUD_BACKUP_INVALID',
      '云端存档无法解密或完整性校验失败，请确认备份密码，或选择其他存档。'
    )
  }
}

import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type {
  CreateProviderInput,
  ProviderSummary,
  ProviderToolId,
  ToolId,
  UpdateProviderInput
} from '@shared/ipc'
import { baseToolId, PROVIDER_TOOL_IDS, TOOL_IDS } from '@shared/ipc'
import {
  hasControlCharacters,
  isObject,
  type ProviderConfigurations,
  type HeaderValue
} from '@shared/configuration'
import { AppError } from '../errors'
import type { AppDatabase } from '../database'
import { validateConfigurations } from './configuration-validation'
import { maskApiKey } from '../utils/api-key'

export interface PortableProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  tools: ProviderToolId[]
  configurations: ProviderConfigurations<HeaderValue>
  createdAt: string
  updatedAt: string
}

export type ResolvedProvider = PortableProvider
interface ProviderDocument {
  providers: PortableProvider[]
}

export class ProviderStore {
  constructor(private readonly database: AppDatabase) {}

  async list(): Promise<ProviderSummary[]> {
    return (await this.load()).providers
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async create(input: CreateProviderInput): Promise<ProviderSummary> {
    const basic = validateBasic(input, PROVIDER_TOOL_IDS)
    const configurations = validateConfigurations(input.configurations, basic.tools)
    const apiKey = validateApiKey(input.apiKey)
    const document = await this.load()
    assertUnique(document.providers, basic.name, basic.tools)
    const now = new Date().toISOString()
    const record = {
      id: randomUUID(),
      ...basic,
      apiKey,
      configurations,
      createdAt: now,
      updatedAt: now
    }
    document.providers.push(record)
    await this.save(document)
    return toSummary(record)
  }

  async update(input: UpdateProviderInput): Promise<ProviderSummary> {
    const document = await this.load()
    const record = document.providers.find((item) => item.id === input.id)
    if (!record) throw new AppError('PROVIDER_NOT_FOUND', '供应商不存在，可能已被删除。')
    const basic = validateBasic(input, PROVIDER_TOOL_IDS)
    assertUnique(document.providers, basic.name, basic.tools, input.id)
    const configurations = validateConfigurations(
      input.configurations,
      basic.tools,
      record.configurations
    )
    const apiKey = input.apiKey.mode === 'keep' ? record.apiKey : validateApiKey(input.apiKey.value)
    Object.assign(record, basic, { configurations, apiKey, updatedAt: new Date().toISOString() })
    await this.save(document)
    return toSummary(record)
  }

  async resolveDraft(input: CreateProviderInput | UpdateProviderInput): Promise<ResolvedProvider> {
    const previous = 'id' in input ? await this.getResolved(input.id) : null
    const basic = validateBasic(input, PROVIDER_TOOL_IDS)
    const apiKey =
      typeof input.apiKey === 'string'
        ? validateApiKey(input.apiKey)
        : input.apiKey.mode === 'replace'
          ? validateApiKey(input.apiKey.value)
          : (previous?.apiKey ?? '')
    return {
      id: previous?.id ?? 'preview',
      ...basic,
      apiKey,
      configurations: validateConfigurations(
        input.configurations,
        basic.tools,
        previous?.configurations
      ),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  async delete(id: string): Promise<void> {
    const document = await this.load()
    const remaining = document.providers.filter((provider) => provider.id !== id)
    if (remaining.length === document.providers.length)
      throw new AppError('PROVIDER_NOT_FOUND', '供应商不存在，可能已被删除。')
    document.providers = remaining
    await this.save(document)
  }

  async getResolved(id: string): Promise<ResolvedProvider> {
    const record = (await this.load()).providers.find((item) => item.id === id)
    if (!record) throw new AppError('PROVIDER_NOT_FOUND', '供应商不存在，可能已被删除。')
    return record
  }

  async listResolved(): Promise<ResolvedProvider[]> {
    return (await this.load()).providers
  }
  async exportPortable(): Promise<PortableProvider[]> {
    return (await this.load()).providers
  }

  exportPortableSync(): PortableProvider[] {
    return decodeDocument({ providers: this.database.readProviders() }).providers
  }

  replacePortable(providers: unknown[]): void {
    this.database.replaceProviders(this.validatePortable(providers))
  }

  async importPortable(providers: unknown[]): Promise<void> {
    await this.save({ providers: this.validatePortable(providers) })
  }

  validatePortable(providers: unknown[]): PortableProvider[] {
    // Portable records may come from backups with environment-specific tool IDs.
    return decodeDocument({ version: 2, providers }).providers
  }

  private async load(): Promise<ProviderDocument> {
    try {
      return this.database.readTransaction(() => ({ providers: this.exportPortableSync() }))
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '供应商数据无法读取，原文件未修改。请检查应用数据目录。'
      )
    }
  }

  private async save(document: ProviderDocument): Promise<void> {
    this.database.replaceProviders(document.providers)
  }
}

export function decodeDocument(value: unknown): ProviderDocument {
  if (
    !isObject(value) ||
    (value.version !== undefined && ![1, 2, 3].includes(value.version as number)) ||
    !Array.isArray(value.providers)
  )
    throw new Error('Invalid provider document')
  const providers: PortableProvider[] = []
  const originals: Array<{ id: string; name: string; tools: ToolId[] }> = []
  for (const raw of value.providers) {
    if (!isObject(raw) || !isUuid(raw.id) || !isIsoDate(raw.createdAt) || !isIsoDate(raw.updatedAt))
      throw new Error('Invalid record')
    const basic = validateBasic(
      raw,
      value.version === undefined || value.version === 3 ? PROVIDER_TOOL_IDS : TOOL_IDS
    )
    if (originals.some((provider) => provider.id === raw.id)) throw new Error('Duplicate ID')
    assertUnique(originals, basic.name, basic.tools)
    originals.push({ id: raw.id, name: basic.name, tools: basic.tools })
    let configurations = raw.configurations
    // Deterministic IDs migrate reads without modifying the library or target files.
    if (configurations === undefined && isObject(raw.models)) {
      configurations = Object.fromEntries(
        basic.tools.map((toolId) => {
          const model = raw.models as Record<string, unknown>
          const id = `legacy-${raw.id}-${toolId}`
          return [
            toolId,
            {
              models: [{ id, model: model[toolId], options: {} }],
              defaultModelId: id,
              headers: []
            }
          ]
        })
      )
    }
    const decoded = validateConfigurations(configurations, basic.tools, {}, true)
    const shared: ProviderConfigurations<HeaderValue> = {}
    const wsl: ProviderConfigurations<HeaderValue> = {}
    for (const toolId of basic.tools) {
      const family = baseToolId(toolId)
      const native = decoded[family]
      const configuration = decoded[toolId]!
      if (toolId !== family && native && !isDeepStrictEqual(native, configuration)) {
        wsl[family] = configuration
      } else {
        shared[family] = native ?? configuration
      }
    }
    const record: PortableProvider = {
      id: raw.id,
      ...basic,
      tools: PROVIDER_TOOL_IDS.filter((toolId) => shared[toolId]),
      apiKey: raw.apiKey === '' ? '' : validateApiKey(raw.apiKey),
      configurations: shared,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
    record.name = migrationName(providers, record)
    providers.push(record)
    const wslTools = PROVIDER_TOOL_IDS.filter((toolId) => wsl[toolId])
    if (wslTools.length) {
      const variant = {
        ...record,
        id: migratedWslId(record.id),
        tools: wslTools,
        configurations: wsl,
        name: `${record.name.slice(0, 52)}（原 WSL）`
      }
      variant.name = migrationName(providers, variant)
      providers.push(variant)
    }
  }
  if (new Set(providers.map((provider) => provider.id)).size !== providers.length)
    throw new Error('Duplicate ID')
  return { providers }
}

function validateBasic<T extends ToolId>(
  input: Record<string, unknown> | CreateProviderInput | UpdateProviderInput,
  allowedTools: readonly T[]
): { name: string; baseUrl: string; tools: T[] } {
  const errors: Record<string, string> = {}
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 60 || hasControlCharacters(name))
    errors.name = '名称长度应为 1 到 60 个字符且不含控制字符。'
  const raw = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  let baseUrl = raw
  try {
    const url = new URL(raw)
    if (
      raw.length > 2048 ||
      hasControlCharacters(raw) ||
      raw.includes(' ') ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new Error('Invalid URL')
    baseUrl = url.toString().replace(/\/+$/u, '')
  } catch {
    errors.baseUrl = '请输入不含凭据、查询参数或片段的完整 HTTP(S) 地址。'
  }
  const tools = input.tools
  if (
    !Array.isArray(tools) ||
    tools.length < 1 ||
    tools.length > allowedTools.length ||
    new Set(tools).size !== tools.length ||
    !tools.every((id) => allowedTools.includes(id))
  )
    errors.tools = '请选择有效的适用工具。'
  if (Object.keys(errors).length)
    throw new AppError('INVALID_INPUT', '供应商信息有误，请检查后重试。', errors)
  return { name, baseUrl, tools: tools as T[] }
}

/** Keep distinct legacy WSL configurations as shared choices with stable identities. */
function migratedWslId(id: string): string {
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(`ai-switch:provider:${id}:wsl`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function migrationName(providers: PortableProvider[], record: PortableProvider): string {
  let name = record.name
  let suffix = 1
  while (
    providers.some(
      (provider) =>
        provider.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        provider.tools.some((toolId) => record.tools.includes(toolId))
    )
  ) {
    const label = `（迁移 ${suffix++}）`
    name = `${record.name.slice(0, 60 - label.length)}${label}`
  }
  return name
}

function validateApiKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 4096 ||
    hasControlCharacters(value) ||
    value.includes('••••')
  )
    throw new AppError('INVALID_INPUT', '请输入有效的 API Key，不能包含控制字符或脱敏占位值。', {
      apiKey: '请填写 API Key。'
    })
  return value.trim()
}

function toSummary(provider: PortableProvider): ProviderSummary {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    tools: [...provider.tools],
    models: Object.fromEntries(
      Object.entries(provider.configurations).map(([id, config]) => [
        id,
        config.models.find((model) => model.id === config.defaultModelId)?.model ?? ''
      ])
    ),
    configurations: Object.fromEntries(
      Object.entries(provider.configurations).map(([id, config]) => [
        id,
        {
          ...structuredClone(config),
          headers: config.headers.map((header) => ({
            id: header.id,
            name: header.name,
            hasValue: header.value.length > 0
          }))
        }
      ])
    ),
    hasApiKey: provider.apiKey.length > 0,
    maskedApiKey: maskApiKey(provider.apiKey),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  }
}

function assertUnique(
  providers: Array<{ id: string; name: string; tools: ToolId[] }>,
  name: string,
  tools: ToolId[],
  id?: string
): void {
  if (
    providers.some(
      (record) =>
        record.id !== id &&
        record.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        record.tools.some((tool) => tools.includes(tool))
    )
  )
    throw new AppError('DUPLICATE_PROVIDER', '此工具中已存在同名供应商。', {
      name: '请使用不同的供应商名称。'
    })
}
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
}
function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

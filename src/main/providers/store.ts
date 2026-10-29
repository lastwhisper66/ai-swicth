import { randomUUID } from 'node:crypto'
import type { CreateProviderInput, ProviderSummary, ToolId, UpdateProviderInput } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import {
  hasControlCharacters,
  isObject,
  type ProviderConfigurations,
  type HeaderValue
} from '@shared/configuration'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'
import { validateConfigurations } from './configuration-validation'
import { maskApiKey } from '../utils/api-key'

const STORAGE_VERSION = 2

export interface PortableProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  tools: ToolId[]
  configurations: ProviderConfigurations<HeaderValue>
  createdAt: string
  updatedAt: string
}

export type ResolvedProvider = PortableProvider
interface ProviderDocument {
  version: number
  providers: PortableProvider[]
}

export class ProviderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ProviderSummary[]> {
    return (await this.load()).providers
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async create(input: CreateProviderInput): Promise<ProviderSummary> {
    const basic = validateBasic(input)
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
    const basic = validateBasic(input)
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
    const basic = validateBasic(input)
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

  async importPortable(providers: unknown[]): Promise<void> {
    await this.save({ version: STORAGE_VERSION, providers: this.validatePortable(providers) })
  }

  validatePortable(providers: unknown[]): PortableProvider[] {
    return decodeDocument({ version: STORAGE_VERSION, providers }).providers
  }

  private async load(): Promise<ProviderDocument> {
    const content = await readOptionalText(this.filePath)
    if (content === null) return { version: STORAGE_VERSION, providers: [] }
    try {
      return decodeDocument(JSON.parse(content))
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '供应商数据无法读取或版本不受支持，原文件未修改。请检查应用数据目录。'
      )
    }
  }

  private async save(document: ProviderDocument): Promise<void> {
    await writeTextAtomic(this.filePath, `${JSON.stringify(document, null, 2)}\n`, true)
  }
}

function decodeDocument(value: unknown): ProviderDocument {
  if (
    !isObject(value) ||
    ![1, STORAGE_VERSION].includes(value.version as number) ||
    !Array.isArray(value.providers)
  )
    throw new Error('Invalid provider document')
  const providers: PortableProvider[] = []
  for (const raw of value.providers) {
    if (!isObject(raw) || !isUuid(raw.id) || !isIsoDate(raw.createdAt) || !isIsoDate(raw.updatedAt))
      throw new Error('Invalid record')
    const basic = validateBasic(raw)
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
              models: [{ id, name: model[toolId], model: model[toolId], options: {} }],
              defaultModelId: id,
              headers: []
            }
          ]
        })
      )
    }
    const record: PortableProvider = {
      id: raw.id,
      ...basic,
      apiKey: raw.apiKey === '' ? '' : validateApiKey(raw.apiKey),
      configurations: validateConfigurations(configurations, basic.tools, {}, true),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
    if (providers.some((provider) => provider.id === record.id)) throw new Error('Duplicate ID')
    assertUnique(providers, record.name, record.tools)
    providers.push(record)
  }
  return { version: STORAGE_VERSION, providers }
}

function validateBasic(
  input: Record<string, unknown> | CreateProviderInput | UpdateProviderInput
): { name: string; baseUrl: string; tools: ToolId[] } {
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
    tools.length > TOOL_IDS.length ||
    new Set(tools).size !== tools.length ||
    !tools.every((id) => TOOL_IDS.includes(id))
  )
    errors.tools = '请选择有效的适用工具。'
  if (Object.keys(errors).length)
    throw new AppError('INVALID_INPUT', '供应商信息有误，请检查后重试。', errors)
  return { name, baseUrl, tools: tools as ToolId[] }
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
  providers: PortableProvider[],
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

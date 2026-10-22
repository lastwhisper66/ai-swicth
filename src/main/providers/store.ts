import { randomUUID } from 'node:crypto'
import type {
  CreateProviderInput,
  ProviderSummary,
  ToolId,
  ToolModels,
  UpdateProviderInput
} from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { AppError } from '../errors'
import { decryptSecret, encryptSecret } from '../security/secure-storage'
import { readOptionalText, writeTextAtomic } from '../utils/files'

const STORAGE_VERSION = 1
const MASKED_API_KEY = '••••••••'

interface ProviderRecord {
  id: string
  name: string
  baseUrl: string
  encryptedApiKey: string
  tools: ToolId[]
  models: ToolModels
  createdAt: string
  updatedAt: string
}

interface ProviderDocument {
  version: number
  providers: ProviderRecord[]
}

export interface ResolvedProvider extends ProviderSummary {
  apiKey: string
}

interface ValidatedProviderInput {
  name: string
  baseUrl: string
  apiKey: string | null
  tools: ToolId[]
  models: ToolModels
}

export class ProviderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ProviderSummary[]> {
    const document = await this.load()
    return document.providers
      .map((provider) => this.toSummary(provider))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async create(input: CreateProviderInput): Promise<ProviderSummary> {
    const validated = validateProviderInput(input)
    const document = await this.load()
    this.assertUniqueName(document.providers, validated.name)
    const now = new Date().toISOString()
    const record: ProviderRecord = {
      id: randomUUID(),
      name: validated.name,
      baseUrl: validated.baseUrl,
      encryptedApiKey: this.encryptApiKey(validated.apiKey ?? ''),
      tools: validated.tools,
      models: validated.models,
      createdAt: now,
      updatedAt: now
    }

    document.providers.push(record)
    await this.save(document)
    return this.toSummary(record)
  }

  async update(input: UpdateProviderInput): Promise<ProviderSummary> {
    const apiKey = input.apiKey.mode === 'replace' ? input.apiKey.value : null
    const validated = validateProviderInput({ ...input, apiKey })
    const document = await this.load()
    const provider = document.providers.find((item) => item.id === input.id)

    if (!provider) {
      throw new AppError('PROVIDER_NOT_FOUND', '供应商不存在，可能已被删除。')
    }

    this.assertUniqueName(document.providers, validated.name, provider.id)
    provider.name = validated.name
    provider.baseUrl = validated.baseUrl
    provider.tools = validated.tools
    provider.models = validated.models
    provider.updatedAt = new Date().toISOString()
    if (validated.apiKey !== null) {
      provider.encryptedApiKey = this.encryptApiKey(validated.apiKey)
    }

    await this.save(document)
    return this.toSummary(provider)
  }

  async delete(id: string): Promise<void> {
    const document = await this.load()
    const nextProviders = document.providers.filter((provider) => provider.id !== id)
    if (nextProviders.length === document.providers.length) {
      throw new AppError('PROVIDER_NOT_FOUND', '供应商不存在，可能已被删除。')
    }

    document.providers = nextProviders
    await this.save(document)
  }

  async getResolved(id: string): Promise<ResolvedProvider> {
    const document = await this.load()
    const provider = document.providers.find((item) => item.id === id)
    if (!provider) {
      throw new AppError('PROVIDER_NOT_FOUND', '供应商不存在，可能已被删除。')
    }

    return { ...this.toSummary(provider), apiKey: this.decryptApiKey(provider.encryptedApiKey) }
  }

  async listResolved(): Promise<ResolvedProvider[]> {
    const document = await this.load()
    const resolved: ResolvedProvider[] = []
    for (const provider of document.providers) {
      try {
        resolved.push({
          ...this.toSummary(provider),
          apiKey: this.decryptApiKey(provider.encryptedApiKey)
        })
      } catch (error) {
        if (
          error instanceof AppError &&
          (error.code === 'STORAGE_CORRUPTED' || error.code === 'SECURE_STORAGE_UNAVAILABLE')
        ) {
          continue
        }
        throw error
      }
    }
    return resolved
  }

  private async load(): Promise<ProviderDocument> {
    const content = await readOptionalText(this.filePath)
    if (content === null) return { version: STORAGE_VERSION, providers: [] }

    try {
      const value: unknown = JSON.parse(content)
      if (!isProviderDocument(value)) throw new Error('Invalid provider document')
      return value
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '供应商数据无法读取。原文件未被修改，请检查应用数据目录。'
      )
    }
  }

  private async save(document: ProviderDocument): Promise<void> {
    await writeTextAtomic(this.filePath, `${JSON.stringify(document, null, 2)}\n`, true)
  }

  private encryptApiKey(apiKey: string): string {
    return encryptSecret(apiKey)
  }

  private decryptApiKey(encryptedApiKey: string): string {
    return decryptSecret(encryptedApiKey, '供应商密钥无法解密。请删除该供应商后重新添加。')
  }

  private toSummary(provider: ProviderRecord): ProviderSummary {
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      tools: [...provider.tools],
      models: { ...provider.models },
      hasApiKey: true,
      maskedApiKey: MASKED_API_KEY,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt
    }
  }

  private assertUniqueName(providers: ProviderRecord[], name: string, currentId?: string): void {
    const duplicate = providers.some(
      (provider) =>
        provider.id !== currentId && provider.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    )
    if (duplicate) {
      throw new AppError('DUPLICATE_PROVIDER', '供应商名称已存在。', {
        name: '请使用不同的供应商名称。'
      })
    }
  }
}

function validateProviderInput(
  input: Omit<CreateProviderInput, 'apiKey'> & { apiKey: string | null }
): ValidatedProviderInput {
  const fieldErrors: Record<string, string> = {}
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const rawBaseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  const apiKey = input.apiKey === null ? null : input.apiKey.trim()

  if (name.length < 1 || name.length > 60) {
    fieldErrors.name = '名称长度应为 1 到 60 个字符。'
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl, fieldErrors)
  if (apiKey !== null && (apiKey.length < 1 || apiKey.length > 4096 || /[\r\n]/u.test(apiKey))) {
    fieldErrors.apiKey = '请输入有效的 API Key，且不能包含换行。'
  }

  const tools = Array.isArray(input.tools)
    ? [...new Set(input.tools.filter((tool): tool is ToolId => TOOL_IDS.includes(tool as ToolId)))]
    : []
  if (tools.length === 0 || tools.length !== input.tools.length) {
    fieldErrors.tools = '请至少选择一个适用工具。'
  }

  const models: ToolModels = {}
  for (const toolId of tools) {
    const model = typeof input.models?.[toolId] === 'string' ? input.models[toolId]?.trim() : ''
    if (!model || model.length > 200 || /[\r\n]/u.test(model)) {
      fieldErrors[`models.${toolId}`] = '请输入有效的模型名称。'
    } else {
      models[toolId] = model
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError('INVALID_INPUT', '供应商信息有误，请检查后重试。', fieldErrors)
  }

  return { name, baseUrl, apiKey, tools, models }
}

function normalizeBaseUrl(rawValue: string, fieldErrors: Record<string, string>): string {
  try {
    if (!rawValue || rawValue.length > 2048 || hasControlCharacters(rawValue)) {
      throw new Error('Invalid URL')
    }

    const url = new URL(rawValue)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    ) {
      throw new Error('Invalid URL')
    }

    return url.toString().replace(/\/+$/u, '')
  } catch {
    fieldErrors.baseUrl = '请输入不含凭据、查询参数或片段的完整 HTTP(S) 地址。'
    return rawValue
  }
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function isProviderDocument(value: unknown): value is ProviderDocument {
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !Array.isArray(value.providers)) {
    return false
  }

  if (!value.providers.every(isProviderRecord)) return false
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const provider of value.providers) {
    const normalizedName = provider.name.toLocaleLowerCase()
    if (ids.has(provider.id) || names.has(normalizedName)) return false
    ids.add(provider.id)
    names.add(normalizedName)
  }
  return true
}

function isProviderRecord(value: unknown): value is ProviderRecord {
  if (!isRecord(value)) return false
  const tools = value.tools
  const models = value.models
  return (
    isUuid(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 60 &&
    typeof value.baseUrl === 'string' &&
    isValidStoredBaseUrl(value.baseUrl) &&
    typeof value.encryptedApiKey === 'string' &&
    value.encryptedApiKey.length > 0 &&
    Array.isArray(tools) &&
    tools.length > 0 &&
    new Set(tools).size === tools.length &&
    tools.every((tool) => TOOL_IDS.includes(tool as ToolId)) &&
    isRecord(models) &&
    Object.keys(models).every((tool) => TOOL_IDS.includes(tool as ToolId)) &&
    tools.every((tool) => {
      const model = models[tool as ToolId]
      return typeof model === 'string' && model.trim().length > 0 && model.length <= 200
    }) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  )
}

function isValidStoredBaseUrl(value: string): boolean {
  const fieldErrors: Record<string, string> = {}
  return normalizeBaseUrl(value, fieldErrors) === value && Object.keys(fieldErrors).length === 0
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && new Date(value).toISOString() === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../database'
import { AppError } from '../errors'
import { COPILOT_API_TYPES } from '@shared/copilot'
import type {
  CopilotConfiguration,
  CopilotProvider,
  SaveCopilotProviderInput
} from '@shared/copilot'
import { hasControlCharacters, isObject } from '@shared/configuration'

export function validateCopilotConfiguration(value: unknown): CopilotConfiguration {
  const fail = (message: string): never => {
    throw new AppError('INVALID_INPUT', message)
  }
  if (!isObject(value) || value.vendor !== 'customendpoint')
    fail('Copilot 供应商的 vendor 必须是 customendpoint。')
  const config = value as Record<string, unknown>
  if (JSON.stringify(config).length > 512_000) fail('Copilot 配置过大，请减少模型和高级选项。')
  assertSafeJson(config)
  config.name = text(config.name, '供应商名称', 100)
  if (
    typeof config.apiKey !== 'string' ||
    config.apiKey.length > 16_384 ||
    /[\r\n\0]/u.test(config.apiKey)
  )
    fail('API Key 必须为单行文本，最多 16384 个字符。')
  config.apiKey = (config.apiKey as string).trim()
  if (config.apiType !== undefined && !COPILOT_API_TYPES.includes(config.apiType as never))
    fail('供应商的旧版 apiType 无效，请使用受支持的 API 类型。')
  if (config.url !== undefined) fail('本版按模型配置接口地址，请移除供应商顶层的 url 字段。')
  if (!Array.isArray(config.models) || !config.models.length || config.models.length > 100)
    fail('每个 Copilot 供应商需要 1 至 100 个模型。')
  const ids = new Set<string>()
  for (const entry of config.models as unknown[]) {
    if (!isObject(entry)) fail('模型配置必须是 JSON 对象。')
    const model = entry as Record<string, unknown>
    model.id = text(model.id, '模型 ID', 256)
    if (ids.has(model.id as string)) fail('同一供应商中的模型 ID 不能重复。')
    ids.add(model.id as string)
    model.name = text(model.name, '模型显示名称', 256)
    model.url = text(model.url, '模型接口地址', 4096)
    try {
      const url = new URL(model.url as string)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
        fail('接口地址应为 HTTP/HTTPS 地址，不能包含用户名、密码或片段。')
    } catch {
      fail('模型接口地址无效，请填写完整的 HTTP/HTTPS 地址。')
    }
    model.apiType ??= config.apiType ?? 'chat-completions'
    if (!COPILOT_API_TYPES.includes(model.apiType as never)) fail('模型的 apiType 无效。')
    for (const key of ['toolCalling', 'vision'])
      if (typeof model[key] !== 'boolean') fail(`模型 ${key} 必须为布尔值。`)
    for (const key of ['maxOutputTokens', 'maxInputTokens', 'contextWindow'])
      if (
        (key === 'maxOutputTokens' || model[key] !== undefined) &&
        (!Number.isSafeInteger(model[key]) ||
          (model[key] as number) <= 0 ||
          (model[key] as number) > 1_000_000_000)
      )
        fail(`模型 ${key} 必须为 1 至 1000000000 的整数。`)
    if (model.maxInputTokens === undefined && model.contextWindow === undefined)
      fail('请填写最大输入 tokens，或通过 contextWindow 指定上下文窗口。')
    if (
      model.contextWindow !== undefined &&
      (!Number.isSafeInteger(model.contextWindow) ||
        (model.contextWindow as number) <
          ((model.maxInputTokens as number | undefined) ?? 1) + (model.maxOutputTokens as number))
    )
      fail('contextWindow 必须是整数，且不能小于输入与输出 token 上限之和。')
    for (const key of ['thinking', 'streaming', 'zeroDataRetentionEnabled', 'statefulResponses'])
      if (model[key] !== undefined && typeof model[key] !== 'boolean') fail(`${key} 必须为布尔值。`)
    if (model.modelOptions !== undefined && !isObject(model.modelOptions))
      fail('modelOptions 必须是对象。')
    if (model.requestHeaders !== undefined) {
      if (!isObject(model.requestHeaders)) fail('requestHeaders 必须是对象。')
      const names = new Set<string>()
      for (const [name, header] of Object.entries(
        model.requestHeaders as Record<string, unknown>
      )) {
        if (
          !/^[!#$%&'*+.^_`|~\da-z-]+$/iu.test(name) ||
          typeof header !== 'string' ||
          /[\r\n\0]/u.test(header)
        )
          fail('请求头名称无效，或请求头值不是单行文本。')
        const normalized = name.toLowerCase()
        if (names.has(normalized)) fail('请求头名称不区分大小写，不能重复。')
        names.add(normalized)
      }
    }
    for (const key of ['supportsReasoningEffort', 'editTools'])
      if (
        model[key] !== undefined &&
        (!Array.isArray(model[key]) ||
          !(model[key] as unknown[]).every((item) => typeof item === 'string' && item.length > 0))
      )
        fail(`${key} 必须是非空字符串组成的数组。`)
  }
  // Preserve inherited protocols from older records before removing the provider default.
  delete config.apiType
  return config as unknown as CopilotConfiguration
}

function text(value: unknown, label: string, max: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    hasControlCharacters(value)
  )
    throw new AppError('INVALID_INPUT', `${label}不能为空，最多 ${max} 个字符，且不能含控制字符。`)
  return value.trim()
}

function assertSafeJson(value: unknown, depth = 0): void {
  if (depth > 30) throw new AppError('INVALID_INPUT', '高级配置嵌套过深。')
  if (Array.isArray(value)) value.forEach((item) => assertSafeJson(item, depth + 1))
  else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new AppError('INVALID_INPUT', '高级配置包含不受支持的字段名称。')
      assertSafeJson(item, depth + 1)
    }
  } else if (
    (typeof value === 'number' && !Number.isFinite(value)) ||
    (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
  )
    throw new AppError('INVALID_INPUT', '高级配置必须是有效的 JSON 数据。')
}

export class CopilotProviderStore {
  constructor(private readonly database: AppDatabase) {}

  list(): CopilotProvider[] {
    const rows = this.database.sql
      .prepare('SELECT document FROM copilot_providers ORDER BY position')
      .all() as Array<{ document: string }>
    try {
      return validatePortableCopilot(rows.map((row) => JSON.parse(row.document)))
    } catch {
      throw new AppError('STORAGE_CORRUPTED', 'Copilot 供应商数据损坏，请从本机数据库备份恢复。')
    }
  }

  get(id: string): CopilotProvider {
    const provider = this.list().find((entry) => entry.id === id)
    if (!provider) throw new AppError('PROVIDER_NOT_FOUND', 'Copilot 供应商已不存在，请刷新列表。')
    return provider
  }

  setOrder(order: string[]): void {
    this.database.transaction(() => {
      const existing = this.database.sql
        .prepare('SELECT id FROM copilot_providers')
        .all() as Array<{
        id: string
      }>
      const ids = new Set(existing.map((provider) => provider.id))
      if (
        order.length !== ids.size ||
        new Set(order).size !== ids.size ||
        order.some((id) => !ids.has(id))
      )
        throw new AppError('INVALID_INPUT', 'Copilot 供应商列表已变化，请刷新页面后重新排序。')
      const update = this.database.sql.prepare(
        'UPDATE copilot_providers SET position = ? WHERE id = ?'
      )
      order.forEach((id, index) => update.run(index, id))
    })
  }

  save(input: SaveCopilotProviderInput): void {
    const configuration = validateCopilotConfiguration(structuredClone(input.configuration))
    const providers = this.list()
    const existing = input.id ? this.get(input.id) : null
    if (existing && input.revision !== existing.updatedAt)
      throw new AppError('CONCURRENT_MODIFICATION', '供应商已改变，请重新打开编辑页面。')
    if (
      providers.some(
        (p) =>
          p.id !== input.id &&
          p.configuration.name.toLocaleLowerCase() === configuration.name.toLocaleLowerCase()
      )
    )
      throw new AppError('DUPLICATE_PROVIDER', '已有同名 Copilot 供应商，请使用其他名称。')
    if (!existing && providers.length >= 200)
      throw new AppError('INVALID_INPUT', '最多可保存 200 个 Copilot 供应商。')
    const now = new Date().toISOString()
    const record: CopilotProvider = {
      id: existing?.id ?? randomUUID(),
      configuration,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    this.database.sql
      .prepare(
        `INSERT INTO copilot_providers (id, document, position)
      VALUES (?, ?, COALESCE((SELECT MAX(position) + 1 FROM copilot_providers), 0))
      ON CONFLICT(id) DO UPDATE SET document = excluded.document`
      )
      .run(record.id, JSON.stringify(record))
  }

  delete(id: string): void {
    this.get(id)
    this.database.sql.prepare('DELETE FROM copilot_providers WHERE id = ?').run(id)
  }

  replace(providers: CopilotProvider[]): void {
    const valid = validatePortableCopilot(providers)
    this.database.transaction(() => {
      this.database.sql.prepare('DELETE FROM copilot_providers').run()
      const insert = this.database.sql.prepare('INSERT INTO copilot_providers VALUES (?, ?, ?)')
      valid.forEach((provider, index) => insert.run(provider.id, JSON.stringify(provider), index))
    })
  }
}

export function validatePortableCopilot(value: unknown): CopilotProvider[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new AppError('INVALID_INPUT', 'Copilot 供应商列表无效。')
  const ids = new Set<string>()
  const names = new Set<string>()
  return value.map((entry) => {
    if (
      !isObject(entry) ||
      typeof entry.id !== 'string' ||
      !/^[\w-]{1,128}$/u.test(entry.id) ||
      typeof entry.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      typeof entry.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.updatedAt))
    )
      throw new AppError('INVALID_INPUT', 'Copilot 供应商记录无效。')
    const configuration = validateCopilotConfiguration(structuredClone(entry.configuration))
    const name = configuration.name.toLocaleLowerCase()
    if (ids.has(entry.id) || names.has(name))
      throw new AppError('INVALID_INPUT', 'Copilot 供应商记录重复。')
    ids.add(entry.id)
    names.add(name)
    return { id: entry.id, configuration, createdAt: entry.createdAt, updatedAt: entry.updatedAt }
  })
}

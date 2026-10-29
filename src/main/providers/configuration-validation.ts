import { baseToolId } from '@shared/ipc'
import type { ToolId } from '@shared/ipc'
import {
  hasControlCharacters,
  CODEX_EFFORTS,
  claudeBaseModel,
  REASONING_SUMMARIES,
  VERBOSITIES,
  ROUTE_KEYS,
  isObject,
  type ProviderConfigurations,
  type HeaderInput,
  type HeaderValue,
  type ModelOptions,
  type ModelPreset
} from '@shared/configuration'
import { AppError } from '../errors'

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,100}$/u.test(value)) fail('记录标识无效。')
  return value
}

function text(value: unknown, max: number, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    hasControlCharacters(value)
  )
    fail(`${label}无效或包含控制字符。`)
  return value.trim()
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail('包含不支持的配置字段，请升级应用或修正输入。')
}

export function validateModelOptions(value: unknown, toolId: ToolId): ModelOptions {
  if (!isObject(value)) fail('模型选项必须为对象。')
  exactKeys(
    value,
    baseToolId(toolId) === 'codex'
      ? ['context1m', 'fast', 'planEffort', 'reasoningSummary', 'verbosity']
      : ['context1m', 'fast', 'autoCompact']
  )
  if (value.context1m !== undefined && value.context1m !== true)
    fail('1M 仅支持请求 1M 或恢复默认。')
  for (const key of ['fast', 'autoCompact']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') fail('模型开关必须为布尔值。')
  }
  if (value.planEffort !== undefined && !CODEX_EFFORTS.includes(value.planEffort as never))
    fail('计划模式思考强度无效。')
  if (
    value.reasoningSummary !== undefined &&
    !REASONING_SUMMARIES.includes(value.reasoningSummary as never)
  )
    fail('思考摘要模式无效。')
  if (value.verbosity !== undefined && !VERBOSITIES.includes(value.verbosity as never))
    fail('回复详细程度无效。')
  if (baseToolId(toolId) === 'claude-code') return value.context1m ? { context1m: true } : {}
  return structuredClone(value) as ModelOptions
}

export function validateConfigurations(
  value: unknown,
  tools: ToolId[],
  previous: ProviderConfigurations<HeaderValue> = {},
  stored = false
): ProviderConfigurations<HeaderValue> {
  if (!isObject(value)) fail('请配置供应商的模型列表。')
  exactKeys(value, tools)
  const result: ProviderConfigurations<HeaderValue> = {}
  for (const toolId of tools) {
    const config = value[toolId]
    if (!isObject(config)) fail('每个适用工具都需要一份模型配置。')
    exactKeys(
      config,
      baseToolId(toolId) === 'codex'
        ? ['models', 'defaultModelId', 'headers', 'supportsWebsockets']
        : ['models', 'defaultModelId', 'headers', 'routes']
    )
    if (!Array.isArray(config.models) || config.models.length < 1 || config.models.length > 100)
      fail('每个工具需保存 1 到 100 个模型预设。')
    const models: ModelPreset[] = config.models.map((model) => {
      if (!isObject(model)) fail('模型记录格式无效。')
      exactKeys(model, ['id', 'name', 'model', 'options'])
      const isClaude = baseToolId(toolId) === 'claude-code'
      const apiModel = text(model.model, isClaude ? 204 : 200, 'API 模型 ID')
      const options = validateModelOptions(model.options, toolId)
      const modelId = isClaude ? claudeBaseModel(apiModel) : apiModel
      if (!modelId.trim()) fail('请填写模型名后再启用 1M 上下文。')
      if (modelId.length > 200) fail('模型名不能超过 200 个字符。')
      if (isClaude && modelId !== apiModel) options.context1m = true
      return {
        id: identifier(model.id),
        name: isClaude
          ? `${modelId}${options.context1m ? '[1m]' : ''}`
          : text(model.name, 80, '模型显示名称'),
        model: modelId,
        options
      }
    })
    if (new Set(models.map((model) => model.id)).size !== models.length)
      fail('模型预设 ID 不能重复。')
    const defaultModelId = identifier(config.defaultModelId)
    if (!models.some((model) => model.id === defaultModelId))
      fail('默认模型必须引用当前列表中的模型。')
    if (!Array.isArray(config.headers) || config.headers.length > 50)
      fail('自定义请求头不能超过 50 项。')
    const names = new Set<string>()
    const ids = new Set<string>()
    const headers: HeaderValue[] = config.headers.map((header) => {
      if (!isObject(header)) fail('请求头格式无效。')
      exactKeys(header, ['id', 'name', 'value'])
      const id = identifier(header.id)
      const name = text(header.name, 200, '请求头名称')
      const lower = name.toLowerCase()
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || names.has(lower) || ids.has(id))
        fail('请求头名称无效、重复，或记录 ID 重复。')
      if (
        [
          'authorization',
          'proxy-authorization',
          'x-api-key',
          'api-key',
          'host',
          'content-length',
          'connection',
          'upgrade'
        ].includes(lower)
      )
        fail('请求头与鉴权或传输协议冲突，请通过 API Key 设置凭据。')
      names.add(lower)
      ids.add(id)
      let resolved: unknown
      if (stored) resolved = header.value
      else {
        if (!isObject(header.value)) fail('请选择保留或替换请求头值。')
        exactKeys(header.value, header.value.mode === 'keep' ? ['mode'] : ['mode', 'value'])
        if (header.value.mode === 'keep') {
          const old = previous[toolId]?.headers.find(
            (entry) => entry.id === id && entry.name.toLowerCase() === lower
          )
          if (!old) fail('无法保留未保存或已改名的请求头，请输入新值。')
          resolved = old.value
        } else if (header.value.mode === 'replace') resolved = header.value.value
        else fail('请求头更新方式无效。')
      }
      if (
        typeof resolved !== 'string' ||
        resolved.length > 8192 ||
        hasControlCharacters(resolved) ||
        resolved.includes('••••')
      )
        fail('请求头值无效、包含控制字符或使用了脱敏占位值。')
      return { id, name, value: resolved }
    })
    const next = { models, defaultModelId, headers }
    result[toolId] = next
    if (baseToolId(toolId) === 'codex' && config.supportsWebsockets !== undefined) {
      if (typeof config.supportsWebsockets !== 'boolean') fail('WebSocket 兼容能力必须为布尔值。')
      result[toolId]!.supportsWebsockets = config.supportsWebsockets
    }
    if (baseToolId(toolId) === 'claude-code' && config.routes !== undefined) {
      if (!isObject(config.routes)) fail('模型路由格式无效。')
      exactKeys(config.routes, ROUTE_KEYS)
      result[toolId]!.routes = Object.fromEntries(
        Object.entries(config.routes).map(([key, model]) => [key, text(model, 200, '路由模型')])
      )
    }
  }
  return result
}

export function toConfigurationInput(
  value: ProviderConfigurations<HeaderValue>
): ProviderConfigurations<HeaderInput> {
  return Object.fromEntries(
    Object.entries(value).map(([toolId, config]) => [
      toolId,
      {
        ...config,
        headers: config.headers.map((header) => ({
          ...header,
          value: { mode: 'replace', value: header.value }
        }))
      }
    ])
  )
}

function fail(message: string): never {
  throw new AppError('INVALID_INPUT', message)
}

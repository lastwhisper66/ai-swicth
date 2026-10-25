import { isDeepStrictEqual } from 'node:util'
import {
  ROUTE_ENV,
  CLAUDE_EFFORTS,
  claudeCanonicalModel,
  mergeTemplate,
  isObject,
  providerOptionPaths,
  readField,
  setField,
  type ConfigObject,
  type OwnedField
} from '@shared/configuration'
import { AppError } from '../errors'
import { applyOwnedFields, verifyFields, type DesiredField } from '../services/managed-state'
import { validateCommonFields } from './configuration-policy'
import type {
  AppliedProviderConfiguration,
  CurrentToolConfiguration,
  GeneratedToolConfiguration,
  ToolAdapter
} from './types'

export class ClaudeCodeAdapter implements ToolAdapter {
  readonly toolId = 'claude-code' as const
  readonly displayName = 'Claude Code'

  extractCommon(content: string | null): string {
    const root = parseJson(content)
    const model = this.parseCurrent(content).model
    const savedEffort = model
      ? readField(root, ['modelSettings', claudeCanonicalModel(model), 'effortLevel']).value
      : undefined
    if (root.effortLevel === undefined && CLAUDE_EFFORTS.includes(savedEffort as never))
      root.effortLevel = savedEffort
    for (const path of providerOptionPaths(this.toolId, root)) setField(root, path, undefined)
    delete root.model
    if (isObject(root.env)) {
      for (const key of Object.keys(root.env))
        if (isProviderEnvironmentKey(key)) delete root.env[key]
      if (!Object.keys(root.env).length) delete root.env
    }
    return serialize(root)
  }

  validateCommon(content: string): void {
    const root = parseJson(content)
    if ('env' in root && !isObject(root.env))
      throw new AppError('INVALID_INPUT', '共通配置中的 env 必须是 JSON 对象。')
    if (
      'model' in root ||
      providerOptionPaths(this.toolId, root).length ||
      (isObject(root.env) && Object.keys(root.env).some(isProviderEnvironmentKey))
    )
      throw new AppError(
        'INVALID_INPUT',
        '共通配置包含供应商连接、路由或模型选项。请先使用“迁移归属字段”将它们迁移至指定供应商和模型。'
      )
    validateCommonFields(this.toolId, root)
  }

  applyCommon(content: string | null, commonContent: string, previousCommon?: string): string {
    this.validateCommon(commonContent)
    const current = parseJson(content)
    const root = mergeTemplate(current, parseJson(commonContent), parseJson(previousCommon ?? null))
    // Preserve provider/model leaves without replacing modelSettings or env wholesale.
    for (const path of providerOptionPaths(this.toolId, current))
      setField(root, path, readField(current, path).value)
    if ('model' in current) root.model = current.model
    if (isObject(current.env))
      for (const [key, value] of Object.entries(current.env))
        if (isProviderEnvironmentKey(key)) setField(root, ['env', key], value)
    syncCommonEffort(root, this.parseCurrent(content).model)
    return serialize(root, content)
  }

  parseCurrent(content: string | null): CurrentToolConfiguration {
    const root = parseJson(content)
    const env = isObject(root.env) ? root.env : {}
    return {
      baseUrl: optionalString(env.ANTHROPIC_BASE_URL),
      model: optionalString(env.ANTHROPIC_MODEL) ?? optionalString(root.model),
      apiKey: optionalString(env.ANTHROPIC_AUTH_TOKEN) ?? optionalString(env.ANTHROPIC_API_KEY)
    }
  }

  providerSignature(content: string): string {
    const root = parseJson(content)
    const snapshot: ConfigObject = { model: root.model }
    if (isObject(root.env))
      snapshot.env = Object.fromEntries(
        Object.entries(root.env)
          .filter(([key]) => isProviderEnvironmentKey(key))
          .sort(([a], [b]) => a.localeCompare(b))
      )
    for (const path of providerOptionPaths(this.toolId, root))
      setField(snapshot, path, readField(root, path).value)
    return canonical(snapshot)
  }

  generate(
    content: string | null,
    provider: AppliedProviderConfiguration,
    previous: OwnedField[] = []
  ): GeneratedToolConfiguration {
    const root = parseJson(content)
    if ('env' in root && !isObject(root.env))
      throw new AppError('MALFORMED_CONFIG', 'Claude Code 的 env 必须是对象，请修复后重试。')
    const desired = desiredOptions(provider)
    // Older releases owned effort/Fast/compaction. Those are no longer preset fields;
    // do not restore them over a newly saved common effort value.
    const managedFields = applyOwnedFields(
      root,
      desired,
      previous.filter((field) => field.path[0] === 'env')
    )
    const env: ConfigObject = isObject(root.env) ? root.env : {}
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_MODEL
    delete env.ANTHROPIC_DEFAULT_MODEL
    env.ANTHROPIC_BASE_URL = provider.baseUrl
    env.ANTHROPIC_AUTH_TOKEN = provider.apiKey
    // Headers belong to the selected connection; never inherit another provider's headers.
    if (provider.configuration.headers.length)
      env.ANTHROPIC_CUSTOM_HEADERS = provider.configuration.headers
        .map((header) => `${header.name}: ${header.value}`)
        .join('\n')
    else delete env.ANTHROPIC_CUSTOM_HEADERS
    root.env = env
    root.model = provider.model
    syncCommonEffort(root, provider.model)
    return {
      content: serialize(root, content),
      managedFields,
      warnings: [
        ...(!provider.version ? ['工具版本未知，模型选项的实际支持情况尚未核实。'] : []),
        ...(provider.preset.options.context1m
          ? ['已为模型添加 [1m] 后缀，实际上下文支持由模型和网关决定，未发起 API 探测。']
          : []),
        ...(provider.configuration.headers.length
          ? ['请求头仅用于模型 API 请求；SDK 自动生成的请求头不保证可被覆盖。']
          : [])
      ]
    }
  }

  verify(content: string, provider: AppliedProviderConfiguration): void {
    const current = this.parseCurrent(content)
    const root = parseJson(content)
    const expectedHeaders = provider.configuration.headers.length
      ? provider.configuration.headers.map((header) => `${header.name}: ${header.value}`).join('\n')
      : undefined
    if (
      current.baseUrl !== provider.baseUrl ||
      current.model !== provider.model ||
      current.apiKey !== provider.apiKey ||
      !verifyFields(root, desiredOptions(provider)) ||
      !isDeepStrictEqual(
        readField(root, ['env', 'ANTHROPIC_CUSTOM_HEADERS']),
        expectedHeaders === undefined ? { exists: false } : { exists: true, value: expectedHeaders }
      )
    )
      throw new AppError('WRITE_FAILED', 'Claude Code 配置写入后校验失败。')
  }
}

function desiredOptions(provider: AppliedProviderConfiguration): DesiredField[] {
  const desired: DesiredField[] = []
  for (const [key, model] of Object.entries(provider.configuration.routes ?? {}))
    desired.push({ path: ['env', ROUTE_ENV[key as keyof typeof ROUTE_ENV]], value: model })
  return desired
}

function syncCommonEffort(root: ConfigObject, model: string | null): void {
  if (!model || !CLAUDE_EFFORTS.includes(root.effortLevel as never)) return
  const canonicalModel = claudeCanonicalModel(model)
  if (
    (root.modelSettings !== undefined && !isObject(root.modelSettings)) ||
    (isObject(root.modelSettings) &&
      root.modelSettings[canonicalModel] !== undefined &&
      !isObject(root.modelSettings[canonicalModel]))
  )
    throw new AppError(
      'MALFORMED_CONFIG',
      'Claude Code 的 modelSettings 及当前模型条目必须是对象，请修复后再保存思考强度。'
    )
  setField(root, ['modelSettings', canonicalModel, 'effortLevel'], root.effortLevel)
}

export function parseClaudeConfiguration(content: string | null): ConfigObject {
  return parseJson(content)
}
function parseJson(content: string | null): ConfigObject {
  if (content === null) return {}
  try {
    const root: unknown = JSON.parse(content)
    if (!isObject(root)) throw new Error('Invalid root')
    return root
  } catch {
    throw new AppError('MALFORMED_CONFIG', 'Claude Code 配置不是有效的 JSON，请修复文件后重试。')
  }
}
function serialize(root: ConfigObject, original: string | null = null): string {
  const newline = original?.includes('\r\n') ? '\r\n' : '\n'
  const indentation = original?.match(/^([ \t]+)"/mu)?.[1] ?? 2
  return JSON.stringify(root, null, indentation).replace(/\n/gu, newline) + newline
}
function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null
}
function isProviderEnvironmentKey(key: string): boolean {
  return (
    /^ANTHROPIC_.*(?:API_KEY|AUTH_TOKEN|BASE_URL|MODEL)/u.test(key) ||
    key === 'ANTHROPIC_CUSTOM_HEADERS' ||
    key === 'CLAUDE_CODE_SUBAGENT_MODEL'
  )
}
export function canonical(value: unknown): string {
  return JSON.stringify(sortObject(value))
}
function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject)
  if (isObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObject(value[key])])
    )
  return value
}

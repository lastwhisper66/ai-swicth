import { stringify } from 'smol-toml'
import { TOOL_NAMES } from '@shared/ipc'
import {
  CODEX_MODEL_ROOT,
  codexEfforts,
  isObject,
  mergeTemplate,
  providerOptionPaths,
  readField,
  setField,
  type ConfigObject,
  type OwnedField
} from '@shared/configuration'
import { AppError } from '../errors'
import { applyOwnedFields, verifyFields, type DesiredField } from '../services/managed-state'
import { canonical } from './claude-code'
import { validateCommonFields } from './configuration-policy'
import { readCodexToml, updateCodexToml, validateCodexToml } from './toml-document'
import type {
  AppliedProviderConfiguration,
  CurrentToolConfiguration,
  GeneratedToolConfiguration,
  ToolAdapter
} from './types'

export class CodexAdapter implements ToolAdapter {
  constructor(readonly toolId: 'codex' | 'codex-wsl' = 'codex') {}

  get displayName(): string {
    return TOOL_NAMES[this.toolId]
  }

  extractCommon(content: string | null): string {
    const root = validateCodexToml(content ?? '')
    delete root.model
    delete root.model_provider
    delete root.model_providers
    // Do not copy model fields into a newly extracted common template.
    CODEX_MODEL_ROOT.forEach((key) => delete root[key])
    setField(root, ['features', 'fast_mode'], undefined)
    return stringify(root)
  }
  validateCommon(content: string): void {
    const root = validateCodexToml(content)
    if (
      ['model', 'model_provider', 'model_providers'].some((key) => key in root) ||
      providerOptionPaths(this.toolId, root).length
    )
      throw new AppError(
        'INVALID_INPUT',
        '共通配置包含供应商或模型选项。请先使用“迁移归属字段”迁移到指定供应商和模型。'
      )
    validateCommonFields(this.toolId, root)
  }
  applyCommon(content: string | null, commonContent: string, previousCommon?: string): string {
    this.validateCommon(commonContent)
    const current = validateCodexToml(content ?? '')
    const root = mergeTemplate(
      current,
      validateCodexToml(commonContent),
      validateCodexToml(previousCommon ?? '')
    )
    for (const path of providerOptionPaths(this.toolId, current))
      setField(root, path, readField(current, path).value)
    return stringify(root)
  }
  parseCurrent(content: string | null): CurrentToolConfiguration {
    const values = readCodexToml(content)
    return { baseUrl: values.baseUrl, model: values.model, apiKey: values.apiKey }
  }
  providerSignature(content: string): string {
    const root = validateCodexToml(content)
    const snapshot: ConfigObject = { model: root.model, model_provider: root.model_provider }
    const providers = isObject(root.model_providers) ? root.model_providers : {}
    snapshot.provider =
      typeof root.model_provider === 'string' ? providers[root.model_provider] : undefined
    for (const key of CODEX_MODEL_ROOT) if (key in root) snapshot[key] = root[key]
    if (readField(root, ['features', 'fast_mode']).exists)
      setField(
        snapshot,
        ['features', 'fast_mode'],
        readField(root, ['features', 'fast_mode']).value
      )
    return canonical(snapshot)
  }
  generate(
    content: string | null,
    provider: AppliedProviderConfiguration,
    previous: OwnedField[] = []
  ): GeneratedToolConfiguration {
    const generated = updateCodexToml(content, {
      providerTable: getProviderTable(provider.providerId),
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKey: provider.apiKey
    })
    const root = validateCodexToml(generated)
    const managedFields = applyOwnedFields(root, desiredOptions(provider), previous)
    const providers = root.model_providers as ConfigObject
    const connection = providers[getProviderTable(provider.providerId)] as ConfigObject
    if (provider.configuration.headers.length)
      connection.http_headers = Object.fromEntries(
        provider.configuration.headers.map((header) => [header.name, header.value])
      )
    else delete connection.http_headers
    if (provider.configuration.supportsWebsockets === undefined)
      delete connection.supports_websockets
    else connection.supports_websockets = provider.configuration.supportsWebsockets
    return {
      content: stringify(root),
      managedFields,
      warnings: [
        ...(provider.preset.options.context1m || provider.preset.options.fast
          ? ['1M / Fast 的实际可用性由模型、账号和网关决定，未发起 API 探测。']
          : []),
        ...(provider.configuration.headers.length
          ? ['自定义请求头仅作用于模型 API，SDK 自动生成的头不保证可被覆盖。']
          : [])
      ]
    }
  }
  verify(content: string, provider: AppliedProviderConfiguration): void {
    const values = readCodexToml(content)
    const root = validateCodexToml(content)
    const table = getProviderTable(provider.providerId)
    const connection = (root.model_providers as ConfigObject)?.[table] as ConfigObject
    const expected = provider.configuration.headers.length
      ? Object.fromEntries(
          provider.configuration.headers.map((header) => [header.name, header.value])
        )
      : undefined
    if (
      values.modelProvider !== table ||
      values.baseUrl !== provider.baseUrl ||
      values.model !== provider.model ||
      values.apiKey !== provider.apiKey ||
      values.wireApi !== 'responses' ||
      values.requiresOpenaiAuth !== false ||
      !verifyFields(root, desiredOptions(provider)) ||
      canonical(connection.http_headers) !== canonical(expected) ||
      connection.supports_websockets !== provider.configuration.supportsWebsockets
    )
      throw new AppError('WRITE_FAILED', 'Codex 配置写入后校验失败。')
  }
}
function desiredOptions(provider: AppliedProviderConfiguration): DesiredField[] {
  const options = provider.preset.options
  const fields: DesiredField[] = []
  for (const effort of [options.planEffort])
    if (effort !== undefined && !codexEfforts(provider.preset.model).includes(effort))
      throw new AppError(
        'INCOMPATIBLE_PROVIDER',
        '无法确认此模型支持所选思考强度，请恢复工具默认或使用已核对的官方模型 ID。'
      )
  const add = (path: string[], value: unknown): void => {
    if (value !== undefined) fields.push({ path, value })
  }
  add(['model_context_window'], options.context1m ? 1000000 : undefined)
  add(['plan_mode_reasoning_effort'], options.planEffort)
  add(['model_reasoning_summary'], options.reasoningSummary)
  add(['model_verbosity'], options.verbosity)
  if (options.fast !== undefined) {
    add(['service_tier'], options.fast ? 'fast' : 'default')
    add(['features', 'fast_mode'], options.fast)
  }
  return fields
}
function getProviderTable(providerId: string): string {
  return `ai-switch-${providerId}`
}

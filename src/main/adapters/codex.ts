import { stringify } from 'smol-toml'
import { TOOL_NAMES } from '@shared/ipc'
import {
  CODEX_COMMON_PATHS,
  CODEX_CONTEXT_WINDOW,
  isObject,
  mergeTemplate,
  type ConfigObject,
  type OwnedField
} from '@shared/configuration'
import { AppError } from '../errors'
import { applyOwnedFields } from '../services/managed-state'
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
    return stringify(root)
  }
  validateCommon(content: string): void {
    const root = validateCodexToml(content)
    if (['model', 'model_provider', 'model_providers'].some((key) => key in root))
      throw new AppError(
        'INVALID_INPUT',
        '共通配置不能包含 model、model_provider 或 model_providers，请在供应商设置中管理。'
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
    // Shared fields already came from the common template. Release their old preset
    // ownership without restoring over the template or changing native values.
    const managedFields = applyOwnedFields(
      root,
      [],
      previous.filter(
        (field) => !CODEX_COMMON_PATHS.some((path) => path.join('.') === field.path.join('.'))
      )
    )
    const providers = root.model_providers as ConfigObject
    const connection = providers[getProviderTable(provider.providerId)] as ConfigObject
    if (provider.configuration.headers.length)
      connection.http_headers = Object.fromEntries(
        provider.configuration.headers.map((header) => [header.name, header.value])
      )
    else delete connection.http_headers
    // Remove the retired capability flag from this app's own provider table.
    delete connection.supports_websockets
    return {
      content: stringify(root),
      managedFields,
      warnings: [
        ...(root.model_context_window === CODEX_CONTEXT_WINDOW || root.service_tier === 'fast'
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
      canonical(connection.http_headers) !== canonical(expected) ||
      connection.supports_websockets !== undefined
    )
      throw new AppError('WRITE_FAILED', 'Codex 配置写入后校验失败。')
  }
}
function getProviderTable(providerId: string): string {
  return `ai-switch-${providerId}`
}

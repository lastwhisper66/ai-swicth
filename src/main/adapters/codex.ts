import { stringify } from 'smol-toml'
import { isDeepStrictEqual } from 'node:util'
import { TOOL_NAMES } from '@shared/ipc'
import type { ProviderCleanupEntry } from '@shared/provider-cleanup'
import { redactCleanupValue } from '../utils/cleanup-preview'
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

/** Keep active connections and profile references usable while removing unmanaged tables. */
export function cleanupCodexProviders(
  content: string,
  providerIds: string[],
  profileContents: Record<string, string | null>
): {
  content: string
  removedCount: number
  referencedCount: number
  entries: ProviderCleanupEntry[]
} {
  const root = validateCodexToml(content)
  const referenced = new Set<string>()
  const profiles = Object.entries(profileContents).map(([path, text]) => {
    try {
      return validateCodexToml(text ?? '')
    } catch {
      throw new AppError('MALFORMED_CONFIG', `Codex Profile 文件无法解析，请修复后再清理：${path}`)
    }
  })
  for (const document of [root, ...profiles]) {
    if (document.profiles !== undefined && !isObject(document.profiles))
      throw new AppError('MALFORMED_CONFIG', 'Codex 的 profiles 必须是表，请修复配置后再清理。')
    for (const settings of [document, ...Object.values(document.profiles ?? {})]) {
      if (
        !isObject(settings) ||
        (settings.model_provider !== undefined && typeof settings.model_provider !== 'string')
      )
        throw new AppError('MALFORMED_CONFIG', 'Codex 的供应商引用无效，请修复配置后再清理。')
      if (typeof settings.model_provider === 'string') referenced.add(settings.model_provider)
    }
  }
  if (root.model_providers === undefined)
    return { content, removedCount: 0, referencedCount: 0, entries: [] }
  if (
    !isObject(root.model_providers) ||
    Object.values(root.model_providers).some((provider) => !isObject(provider))
  )
    throw new AppError(
      'MALFORMED_CONFIG',
      'Codex 的 model_providers 必须由供应商表组成，请修复后再清理。'
    )
  const managed = new Set(providerIds.map(getProviderTable))
  const removed = Object.keys(root.model_providers).filter(
    (name) => !managed.has(name) && !referenced.has(name)
  )
  const referencedCount = Object.keys(root.model_providers).filter(
    (name) => !managed.has(name) && referenced.has(name)
  ).length
  if (!removed.length) return { content, removedCount: 0, referencedCount, entries: [] }
  const entries = removed.map((name) => {
    const definition = redactCleanupValue(
      (root.model_providers as ConfigObject)[name]
    ) as ConfigObject
    return {
      label: typeof definition.name === 'string' ? definition.name : name,
      location: `model_providers.${JSON.stringify(name)}`,
      content: stringify({ model_providers: { [name]: definition } })
    }
  })
  for (const name of removed) delete root.model_providers[name]
  if (!Object.keys(root.model_providers).length) delete root.model_providers
  const next = stringify(root)
  if (!isDeepStrictEqual(validateCodexToml(next), root))
    throw new AppError('WRITE_FAILED', 'Codex 清理结果校验失败，原文件未修改。')
  return { content: next, removedCount: removed.length, referencedCount, entries }
}

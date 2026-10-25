import { parse, stringify } from 'smol-toml'
import { isObject } from '@shared/configuration'
import { AppError } from '../errors'

export function validateCodexToml(content: string): Record<string, unknown> {
  try {
    return parse(content)
  } catch {
    throw new AppError(
      'MALFORMED_CONFIG',
      'Codex 配置不是有效的 TOML，请检查语法、重复字段和表定义后重试。'
    )
  }
}

export interface CodexTomlValues {
  model: string | null
  modelProvider: string | null
  baseUrl: string | null
  apiKey: string | null
  wireApi: string | null
  requiresOpenaiAuth: boolean | null
}
export interface CodexTomlUpdate {
  providerTable: string
  providerName: string
  baseUrl: string
  model: string
  apiKey: string
}
export function readCodexToml(content: string | null): CodexTomlValues {
  const root = validateCodexToml(content ?? '')
  const modelProvider = optionalString(root.model_provider)
  const providers = isObject(root.model_providers) ? root.model_providers : {}
  const provider =
    modelProvider && isObject(providers[modelProvider]) ? providers[modelProvider] : {}
  return {
    model: optionalString(root.model),
    modelProvider,
    baseUrl: optionalString(provider.base_url),
    apiKey: optionalString(provider.experimental_bearer_token),
    wireApi: optionalString(provider.wire_api),
    requiresOpenaiAuth:
      typeof provider.requires_openai_auth === 'boolean' ? provider.requires_openai_auth : null
  }
}
export function updateCodexToml(content: string | null, update: CodexTomlUpdate): string {
  const root = validateCodexToml(content ?? '')
  const providers = isObject(root.model_providers) ? root.model_providers : {}
  const existing = providers[update.providerTable]
  const provider = isObject(existing) ? existing : {}
  root.model = update.model
  root.model_provider = update.providerTable
  // Do not leave an external environment-key reference overriding the saved credential.
  delete provider.env_key
  delete provider.env_http_headers
  Object.assign(provider, {
    name: update.providerName,
    base_url: update.baseUrl,
    wire_api: 'responses',
    experimental_bearer_token: update.apiKey,
    requires_openai_auth: false
  })
  providers[update.providerTable] = provider
  root.model_providers = providers
  return stringify(root)
}
function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

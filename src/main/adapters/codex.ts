import { AppError } from '../errors'
import { stringify } from 'smol-toml'
import { readCodexToml, updateCodexToml, validateCodexToml } from './toml-document'
import type {
  AppliedProviderConfiguration,
  CurrentToolConfiguration,
  GeneratedToolConfiguration,
  ToolAdapter
} from './types'

export class CodexAdapter implements ToolAdapter {
  readonly toolId = 'codex' as const
  readonly displayName = 'Codex'

  extractCommon(content: string | null): string {
    const root = validateCodexToml(content ?? '')
    delete root.model
    delete root.model_provider
    delete root.model_providers
    return stringify(root)
  }

  validateCommon(content: string): void {
    const root = validateCodexToml(content)
    if (['model', 'model_provider', 'model_providers'].some((key) => key in root)) {
      throw new AppError(
        'INVALID_INPUT',
        '共通配置不能包含 model、model_provider 或 model_providers，请在供应商中设置。'
      )
    }
  }

  applyCommon(content: string | null, commonContent: string): string {
    this.validateCommon(commonContent)
    const current = validateCodexToml(content ?? '')
    const providerRoot = Object.fromEntries(
      ['model', 'model_provider'].filter((key) => key in current).map((key) => [key, current[key]])
    )
    const providerTables =
      'model_providers' in current ? stringify({ model_providers: current.model_providers }) : ''
    const merged =
      `${stringify(providerRoot)}\n${commonContent.trim()}\n\n${providerTables}`.trim() + '\n'
    validateCodexToml(merged)
    return merged
  }

  parseCurrent(content: string | null): CurrentToolConfiguration {
    const values = readCodexToml(content)
    return {
      baseUrl: values.baseUrl,
      model: values.model,
      apiKey: values.apiKey
    }
  }

  generate(
    content: string | null,
    provider: AppliedProviderConfiguration
  ): GeneratedToolConfiguration {
    return {
      content: updateCodexToml(content, {
        providerTable: getProviderTable(provider.providerId),
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKey: provider.apiKey
      }),
      warnings: []
    }
  }

  verify(content: string, provider: AppliedProviderConfiguration): void {
    const values = readCodexToml(content)
    if (
      values.modelProvider !== getProviderTable(provider.providerId) ||
      values.baseUrl !== provider.baseUrl ||
      values.model !== provider.model ||
      values.apiKey !== provider.apiKey ||
      values.wireApi !== 'responses' ||
      values.requiresOpenaiAuth !== false
    ) {
      throw new AppError('WRITE_FAILED', 'Codex 配置写入后校验失败。')
    }
  }
}

function getProviderTable(providerId: string): string {
  return `ai-switch-${providerId}`
}

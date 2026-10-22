import { AppError } from '../errors'
import { readCodexToml, updateCodexToml } from './toml-document'
import type {
  AppliedProviderConfiguration,
  CurrentToolConfiguration,
  GeneratedToolConfiguration,
  ToolAdapter
} from './types'

export class CodexAdapter implements ToolAdapter {
  readonly toolId = 'codex' as const
  readonly displayName = 'Codex'

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
      values.wireApi !== 'responses'
    ) {
      throw new AppError('WRITE_FAILED', 'Codex 配置写入后校验失败。')
    }
  }
}

function getProviderTable(providerId: string): string {
  return `ai-switch-${providerId}`
}

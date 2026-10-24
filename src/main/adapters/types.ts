import type { ToolId } from '@shared/ipc'

export interface AppliedProviderConfiguration {
  providerId: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
}

export interface CurrentToolConfiguration {
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

export interface GeneratedToolConfiguration {
  content: string
  warnings: string[]
}

export interface ToolAdapter {
  readonly toolId: ToolId
  readonly displayName: string
  extractCommon(content: string | null): string
  applyCommon(content: string | null, commonContent: string): string
  validateCommon(content: string): void
  parseCurrent(content: string | null): CurrentToolConfiguration
  generate(
    content: string | null,
    provider: AppliedProviderConfiguration
  ): GeneratedToolConfiguration
  verify(content: string, provider: AppliedProviderConfiguration): void
}

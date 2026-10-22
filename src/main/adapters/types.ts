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
  parseCurrent(content: string | null): CurrentToolConfiguration
  generate(
    content: string | null,
    provider: AppliedProviderConfiguration
  ): GeneratedToolConfiguration
  verify(content: string, provider: AppliedProviderConfiguration): void
}

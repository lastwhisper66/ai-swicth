import type { ToolId } from '@shared/ipc'
import type {
  HeaderValue,
  ModelPreset,
  OwnedField,
  ProviderToolConfiguration
} from '@shared/configuration'

export interface AppliedProviderConfiguration {
  providerId: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
  preset: ModelPreset
  configuration: ProviderToolConfiguration<HeaderValue>
  version: string | null
}

export interface CurrentToolConfiguration {
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

export interface GeneratedToolConfiguration {
  content: string
  warnings: string[]
  managedFields?: OwnedField[]
}

export interface ToolAdapter {
  readonly toolId: ToolId
  readonly displayName: string
  extractCommon(content: string | null): string
  applyCommon(content: string | null, commonContent: string, previousCommon?: string): string
  validateCommon(content: string): void
  parseCurrent(content: string | null): CurrentToolConfiguration
  providerSignature(content: string): string
  generate(
    content: string | null,
    provider: AppliedProviderConfiguration,
    previous?: OwnedField[]
  ): GeneratedToolConfiguration
  verify(content: string, provider: AppliedProviderConfiguration): void
}

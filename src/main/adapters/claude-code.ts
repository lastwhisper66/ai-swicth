import { AppError } from '../errors'
import type {
  AppliedProviderConfiguration,
  CurrentToolConfiguration,
  GeneratedToolConfiguration,
  ToolAdapter
} from './types'

type JsonObject = Record<string, unknown>

export class ClaudeCodeAdapter implements ToolAdapter {
  readonly toolId = 'claude-code' as const
  readonly displayName = 'Claude Code'

  extractCommon(content: string | null): string {
    const root = content === null ? {} : parseJsonObject(content)
    delete root.model
    if (isJsonObject(root.env)) {
      for (const key of Object.keys(root.env)) {
        if (isProviderEnvironmentKey(key)) delete root.env[key]
      }
      if (Object.keys(root.env).length === 0) delete root.env
    }
    return `${JSON.stringify(root, null, 2)}\n`
  }

  validateCommon(content: string): void {
    const root = parseJsonObject(content)
    if ('env' in root && !isJsonObject(root.env)) {
      throw new AppError('INVALID_INPUT', '共通配置中的 env 必须是 JSON 对象。')
    }
    if (
      'model' in root ||
      (isJsonObject(root.env) && Object.keys(root.env).some(isProviderEnvironmentKey))
    ) {
      throw new AppError(
        'INVALID_INPUT',
        '共通配置不能包含 model 或 env 中的供应商地址、密钥、模型字段，请在供应商中设置。'
      )
    }
  }

  applyCommon(content: string | null, commonContent: string): string {
    this.validateCommon(commonContent)
    const root = parseJsonObject(commonContent)
    const current = content === null ? {} : parseJsonObject(content)
    if ('model' in current) root.model = current.model
    const providerEnvironment = Object.fromEntries(
      Object.entries(isJsonObject(current.env) ? current.env : {}).filter(([key]) =>
        isProviderEnvironmentKey(key)
      )
    )
    if (Object.keys(providerEnvironment).length > 0) {
      root.env = { ...(isJsonObject(root.env) ? root.env : {}), ...providerEnvironment }
    }
    return `${JSON.stringify(root, null, detectIndentation(content))}\n`
  }

  parseCurrent(content: string | null): CurrentToolConfiguration {
    if (content === null) return { baseUrl: null, model: null, apiKey: null }
    const root = parseJsonObject(content)
    const environment = isJsonObject(root.env) ? root.env : {}

    return {
      baseUrl: readOptionalString(environment.ANTHROPIC_BASE_URL),
      model: readOptionalString(environment.ANTHROPIC_MODEL) ?? readOptionalString(root.model),
      apiKey:
        readOptionalString(environment.ANTHROPIC_AUTH_TOKEN) ??
        readOptionalString(environment.ANTHROPIC_API_KEY)
    }
  }

  generate(
    content: string | null,
    provider: AppliedProviderConfiguration
  ): GeneratedToolConfiguration {
    const root = content === null ? {} : parseJsonObject(content)
    const environment: JsonObject = isJsonObject(root.env) ? { ...root.env } : {}
    const warnings: string[] = []

    if ('ANTHROPIC_API_KEY' in environment || 'ANTHROPIC_MODEL' in environment) {
      warnings.push('已移除同一配置文件中会覆盖当前路由的旧凭据或模型变量。')
    }

    delete environment.ANTHROPIC_API_KEY
    delete environment.ANTHROPIC_MODEL
    environment.ANTHROPIC_BASE_URL = provider.baseUrl
    environment.ANTHROPIC_AUTH_TOKEN = provider.apiKey
    root.env = environment
    root.model = provider.model

    const indentation = detectIndentation(content)
    const trailingNewline = content === null || /\r?\n$/u.test(content)
    const newline = content?.includes('\r\n') ? '\r\n' : '\n'
    const serialized = JSON.stringify(root, null, indentation).replace(/\n/gu, newline)
    return {
      content: trailingNewline ? `${serialized}${newline}` : serialized,
      warnings
    }
  }

  verify(content: string, provider: AppliedProviderConfiguration): void {
    const current = this.parseCurrent(content)
    if (
      current.baseUrl !== provider.baseUrl ||
      current.model !== provider.model ||
      current.apiKey !== provider.apiKey
    ) {
      throw new AppError('WRITE_FAILED', 'Claude Code 配置写入后校验失败。')
    }
  }
}

function parseJsonObject(content: string): JsonObject {
  try {
    const value: unknown = JSON.parse(content)
    if (!isJsonObject(value)) throw new Error('Root must be an object')
    return value
  } catch {
    throw new AppError('MALFORMED_CONFIG', 'Claude Code 配置不是有效的 JSON，请修复文件后重试。')
  }
}

function detectIndentation(content: string | null): number {
  if (!content) return 2
  const match = content.match(/^([ \t]+)"/mu)
  if (!match) return 2
  return match[1]?.startsWith('\t') ? 1 : Math.min(match[1]?.length ?? 2, 8)
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProviderEnvironmentKey(key: string): boolean {
  return (
    /^ANTHROPIC_.*(?:API_KEY|AUTH_TOKEN|BASE_URL|MODEL)/u.test(key) ||
    key === 'CLAUDE_CODE_SUBAGENT_MODEL'
  )
}

import { parse, stringify } from 'smol-toml'
import type { ToolId } from '@shared/ipc'
import { AppError } from '../errors'
import { maskApiKey } from '../utils/api-key'

const secretKey =
  /(?:api[_-]?key|token|secret|password|passwd|authorization|cookie|private[_-]?key)$|^(?:tokens|credentials?|http_headers|env_http_headers|headers|ANTHROPIC_CUSTOM_HEADERS)$/iu
const apiKeyField = /api[_-]?key$|^(?:ANTHROPIC_AUTH_TOKEN|experimental_bearer_token)$/iu

/** Mask API keys and hide other credentials before returning configuration text to the renderer. */
export function redactConfiguration(
  content: string,
  language: 'json' | 'toml',
  toolId: ToolId,
  knownApiKeys: string[] = []
): string {
  try {
    const value: unknown = language === 'json' ? JSON.parse(content) : parse(content)
    const secrets = [...knownApiKeys]
    const apiKeys = new Set(knownApiKeys)
    collectSecrets(value, secrets, apiKeys)
    const replacements = new Map(
      secrets
        .filter(Boolean)
        .map((secret) => [secret, apiKeys.has(secret) ? maskApiKey(secret) : '••••••••'])
    )
    const pattern = replacements.size
      ? new RegExp(
          [...replacements.keys()]
            .sort((a, b) => b.length - a.length)
            .map((secret) => secret.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
            .join('|'),
          'gu'
        )
      : null
    const redacted = redact(value, (text) =>
      pattern ? text.replace(pattern, (secret) => replacements.get(secret)!) : text
    )
    return language === 'json'
      ? `${JSON.stringify(redacted, null, 2)}\n`
      : stringify(redacted as Record<string, unknown>)
  } catch {
    throw new AppError(
      'MALFORMED_CONFIG',
      `${toolId === 'codex' ? 'Codex' : 'Claude Code'} 配置格式损坏，请修复后再预览。`
    )
  }
}

function collectSecrets(value: unknown, secrets: string[], apiKeys: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSecrets(entry, secrets, apiKeys))
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'ANTHROPIC_CUSTOM_HEADERS' && typeof entry === 'string') {
        for (const line of entry.split(/\r?\n/u)) {
          const separator = line.indexOf(':')
          if (separator >= 0) collectStrings(line.slice(separator + 1).trim(), secrets)
        }
      }
      if (secretKey.test(key))
        collectStrings(entry, secrets, apiKeyField.test(key) ? apiKeys : undefined)
      else collectSecrets(entry, secrets, apiKeys)
    }
  }
}

function collectStrings(value: unknown, secrets: string[], apiKeys?: Set<string>): void {
  if (typeof value === 'string' && value.length > 0) {
    secrets.push(value)
    apiKeys?.add(value)
  } else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, secrets, apiKeys))
  else if (value && typeof value === 'object')
    Object.values(value).forEach((entry) => collectStrings(entry, secrets, apiKeys))
}

function redact(value: unknown, replaceSecrets: (value: string) => string): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry, replaceSecrets))
  if (value instanceof Date) return value
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        secretKey.test(key)
          ? redactSecretValue(entry, apiKeyField.test(key))
          : redact(entry, replaceSecrets)
      ])
    )
  }
  if (typeof value === 'string') return replaceSecrets(value)
  return value
}

function redactSecretValue(value: unknown, apiKey: boolean): unknown {
  if (typeof value === 'string')
    return apiKey ? maskApiKey(value) : value.length > 0 ? '••••••••' : value
  if (Array.isArray(value)) return value.map((entry) => redactSecretValue(entry, apiKey))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactSecretValue(entry, apiKey)])
    )
  }
  return value
}

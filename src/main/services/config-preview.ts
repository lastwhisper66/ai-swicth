import { parse, stringify } from 'smol-toml'
import type { ToolId } from '@shared/ipc'
import { AppError } from '../errors'

const secretKey =
  /(?:api[_-]?key|token|secret|password|passwd|authorization|cookie|private[_-]?key)$|^(?:tokens|credentials?)$/iu

/** Redact in the main process so saved credentials never reach the renderer. */
export function redactConfiguration(
  content: string,
  language: 'json' | 'toml',
  toolId: ToolId,
  knownSecrets: string[] = []
): string {
  try {
    const value: unknown = language === 'json' ? JSON.parse(content) : parse(content)
    const secrets = [...knownSecrets]
    collectSecrets(value, secrets)
    const redacted = redact(value, secrets)
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

function collectSecrets(value: unknown, secrets: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSecrets(entry, secrets))
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (secretKey.test(key)) collectStrings(entry, secrets)
      else collectSecrets(entry, secrets)
    }
  }
}

function collectStrings(value: unknown, secrets: string[]): void {
  if (typeof value === 'string' && value.length > 0) secrets.push(value)
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, secrets))
  else if (value && typeof value === 'object')
    Object.values(value).forEach((entry) => collectStrings(entry, secrets))
}

function redact(value: unknown, secrets: string[]): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secrets))
  if (value instanceof Date) return value
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        secretKey.test(key) ? redactSecretValue(entry) : redact(entry, secrets)
      ])
    )
  }
  if (typeof value === 'string') {
    let result = value
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length))
      result = result.replaceAll(secret, '••••••••')
    return result
  }
  return value
}

function redactSecretValue(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 0 ? '••••••••' : value
  if (Array.isArray(value)) return value.map(redactSecretValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactSecretValue(entry)])
    )
  }
  return value
}

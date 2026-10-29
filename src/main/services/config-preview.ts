import { baseToolId } from '@shared/ipc'
import { parse, stringify } from 'smol-toml'
import type { ToolId } from '@shared/ipc'
import { AppError } from '../errors'
import { maskApiKey } from '../utils/api-key'

/** Mask only the provided API tokens before returning configuration text. */
export function redactConfiguration(
  content: string,
  language: 'json' | 'toml',
  toolId: ToolId,
  tokens: string[] = []
): string {
  try {
    const value: unknown = language === 'json' ? JSON.parse(content) : parse(content)
    const replacements = new Map(tokens.filter(Boolean).map((token) => [token, maskApiKey(token)]))
    const pattern = replacements.size
      ? new RegExp(
          [...replacements.keys()]
            .sort((a, b) => b.length - a.length)
            .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
            .join('|'),
          'gu'
        )
      : null
    const redacted = redactTokens(value, (text) =>
      pattern ? text.replace(pattern, (token) => replacements.get(token)!) : text
    )
    return language === 'json'
      ? `${JSON.stringify(redacted, null, 2)}\n`
      : stringify(redacted as Record<string, unknown>)
  } catch {
    throw new AppError(
      'MALFORMED_CONFIG',
      `${baseToolId(toolId) === 'codex' ? 'Codex' : 'Claude Code'} 配置格式损坏，请修复后再预览。`
    )
  }
}

function redactTokens(value: unknown, replaceTokens: (value: string) => string): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactTokens(entry, replaceTokens))
  if (value instanceof Date) return value
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactTokens(entry, replaceTokens)])
    )
  }
  if (typeof value === 'string') return replaceTokens(value)
  return value
}

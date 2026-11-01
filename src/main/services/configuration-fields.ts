import { baseToolId } from '@shared/ipc'
import { randomUUID } from 'node:crypto'
import type { ToolId } from '@shared/ipc'
import {
  ROUTE_ENV,
  parseConfiguration,
  readField,
  serializeConfiguration,
  setField,
  type HeaderValue,
  type ProviderToolConfiguration
} from '@shared/configuration'
import { AppError } from '../errors'

/** Moves only into the explicitly chosen connection and preset, never every provider. */
export function moveConfigurationFields(
  toolId: ToolId,
  content: string,
  configuration: ProviderToolConfiguration<HeaderValue>,
  modelId: string
): { content: string; configuration: ProviderToolConfiguration<HeaderValue> } {
  const root = parseConfiguration(toolId, content)
  const next = structuredClone(configuration)
  const preset = next.models.find((model) => model.id === modelId)
  if (!preset) throw new AppError('INVALID_INPUT', '迁移目标模型不存在。')
  const move = (path: string[], assign: (value: unknown) => void): void => {
    const field = readField(root, path)
    if (!field.exists) return
    assign(field.value)
    setField(root, path, undefined)
  }
  if (baseToolId(toolId) === 'claude-code') {
    for (const [key, name] of Object.entries(ROUTE_ENV))
      move(['env', name], (value) => {
        next.routes = { ...next.routes, [key]: value }
      })
    move(['env', 'ANTHROPIC_CUSTOM_HEADERS'], (value) => {
      if (typeof value !== 'string')
        throw new AppError('INVALID_INPUT', '旧自定义请求头必须是字符串。')
      const imported = value
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .map((line) => {
          const separator = line.indexOf(':')
          if (separator < 1)
            throw new AppError('INVALID_INPUT', '旧请求头无法解析，请修复为每行“名称: 值”。')
          return {
            id: randomUUID(),
            name: line.slice(0, separator).trim(),
            value: line.slice(separator + 1).trim()
          }
        })
      // Existing headers are replaced only on this selected connection, after explicit confirmation.
      next.headers = imported
    })
  }
  return { content: serializeConfiguration(toolId, root), configuration: next }
}

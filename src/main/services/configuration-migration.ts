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
export function migrateConfiguration(
  toolId: ToolId,
  content: string,
  configuration: ProviderToolConfiguration<HeaderValue>,
  modelId: string
): { content: string; configuration: ProviderToolConfiguration<HeaderValue> } {
  const root = parseConfiguration(toolId, content)
  const next = structuredClone(configuration)
  const preset = next.models.find((model) => model.id === modelId)
  if (!preset) throw new AppError('INVALID_INPUT', '迁移目标模型不存在。')
  const options = preset.options
  const move = (path: string[], assign: (value: unknown) => void): void => {
    const field = readField(root, path)
    if (!field.exists) return
    assign(field.value)
    setField(root, path, undefined)
  }
  if (baseToolId(toolId) === 'codex') {
    if (root.model_context_window === 1000000)
      move(['model_context_window'], () => {
        options.context1m = true
      })
    move(['plan_mode_reasoning_effort'], (value) => {
      options.planEffort = value as string
    })
    move(['model_reasoning_summary'], (value) => {
      options.reasoningSummary = value as never
    })
    move(['model_verbosity'], (value) => {
      options.verbosity = value as never
    })
    if (root.service_tier === 'fast' || root.service_tier === 'default')
      move(['service_tier'], (value) => {
        options.fast = value === 'fast'
      })
    move(['features', 'fast_mode'], (value) => {
      if (typeof value !== 'boolean')
        throw new AppError('INVALID_INPUT', '旧 fast_mode 必须为布尔值。')
      if (options.fast !== undefined && options.fast !== value)
        throw new AppError('INVALID_INPUT', '旧 service_tier 与 fast_mode 冲突，请先在原文中处理。')
      if (options.fast === undefined) options.fast = value
    })
  } else {
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

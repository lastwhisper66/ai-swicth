import { baseToolId } from '@shared/ipc'
import { parse, stringify } from 'smol-toml'
import type { ProviderToolId, ToolId } from './ipc'

export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const
export const CODEX_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra'
] as const
export const CODEX_CONTEXT_WINDOW = 1_000_000
export const CODEX_DEFAULT_COMPACT_LIMIT = 900_000
export const ROUTE_KEYS = ['opus', 'sonnet', 'haiku', 'subagent'] as const
export const ROUTE_ENV = {
  opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  subagent: 'CLAUDE_CODE_SUBAGENT_MODEL'
} as const

export interface ModelOptions {
  context1m?: true
}

export interface ModelPreset {
  id: string
  model: string
  options: ModelOptions
}

export interface HeaderSummary {
  id: string
  name: string
  hasValue: boolean
}

export interface HeaderValue {
  id: string
  name: string
  value: string
}

export interface HeaderInput {
  id: string
  name: string
  value: { mode: 'keep' } | { mode: 'replace'; value: string }
}

export interface ProviderToolConfiguration<H = HeaderSummary> {
  models: ModelPreset[]
  defaultModelId: string
  headers: H[]
  routes?: Partial<Record<(typeof ROUTE_KEYS)[number], string>>
}

export type ProviderConfigurations<H = HeaderSummary> = Partial<
  Record<ProviderToolId, ProviderToolConfiguration<H>>
>

export type ConfigObject = Record<string, unknown>
export type ConfigPath = string[]
export interface FieldValue {
  exists: boolean
  value?: unknown
}
export interface OwnedField {
  path: ConfigPath
  before: FieldValue
  applied: FieldValue
}
export interface ManagedState {
  targetPath: string
  fields: OwnedField[]
  selection?: { providerId: string; modelId: string; signature?: string }
  attribution?: FieldValue
  common?: string
}

export function isObject(value: unknown): value is ConfigObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  )
}

export function readField(root: ConfigObject, path: ConfigPath): FieldValue {
  let cursor: unknown = root
  for (const key of path) {
    if (!isObject(cursor) || !Object.hasOwn(cursor, key)) return { exists: false }
    cursor = cursor[key]
  }
  return { exists: true, value: cursor }
}

export function setField(root: ConfigObject, path: ConfigPath, value: unknown): void {
  if (path.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
    throw new Error('配置字段名称不受支持。')
  const [key, ...rest] = path
  if (!key) return
  if (!rest.length) {
    if (value === undefined) delete root[key]
    else root[key] = value
    return
  }
  if (!isObject(root[key])) {
    if (value === undefined) return
    root[key] = {}
  }
  const child = root[key] as ConfigObject
  setField(child, rest, value)
  if (Object.keys(child).length === 0) delete root[key]
}

export function parseConfiguration(toolId: ToolId, content: string): ConfigObject {
  const root: unknown = baseToolId(toolId) === 'codex' ? parse(content) : JSON.parse(content)
  if (!isObject(root)) throw new Error('配置根节点必须是对象。')
  return root
}

export function serializeConfiguration(toolId: ToolId, root: ConfigObject): string {
  return baseToolId(toolId) === 'codex' ? stringify(root) : `${JSON.stringify(root, null, 2)}\n`
}

export const CODEX_COMMON_PATHS: ConfigPath[] = [
  ['model_context_window'],
  ['model_auto_compact_token_limit'],
  ['service_tier'],
  ['features', 'fast_mode']
]

export function codexCommonError(root: ConfigObject): string | null {
  const contextWindow = root.model_context_window
  const compactLimit = root.model_auto_compact_token_limit
  if (
    contextWindow !== undefined &&
    (typeof contextWindow !== 'number' || !Number.isSafeInteger(contextWindow) || contextWindow < 1)
  )
    return 'model_context_window 必须为正整数（tokens）。'
  if (
    compactLimit !== undefined &&
    (typeof compactLimit !== 'number' || !Number.isSafeInteger(compactLimit) || compactLimit < 1)
  )
    return '自动压缩阈值必须为正整数（tokens），请填写 model_auto_compact_token_limit。'
  if (
    typeof contextWindow === 'number' &&
    typeof compactLimit === 'number' &&
    compactLimit > contextWindow
  )
    return '自动压缩阈值不能超过上下文窗口大小。'
  if (
    root.service_tier !== undefined &&
    (typeof root.service_tier !== 'string' || !root.service_tier.trim())
  )
    return 'service_tier 必须为非空字符串。'
  if (
    isObject(root.features) &&
    root.features.fast_mode !== undefined &&
    typeof root.features.fast_mode !== 'boolean'
  )
    return 'features.fast_mode 必须为 true 或 false。'
  return null
}

/** Only the fields in this release are owned; unknown modelSettings children remain untouched. */
export function providerOptionPaths(toolId: ToolId, root: ConfigObject): ConfigPath[] {
  const paths: ConfigPath[] = []
  const add = (path: ConfigPath): void => {
    if (readField(root, path).exists) paths.push(path)
  }
  if (baseToolId(toolId) === 'claude-code') {
    add(['env', 'ANTHROPIC_CUSTOM_HEADERS'])
    Object.values(ROUTE_ENV).forEach((key) => add(['env', key]))
  }
  return paths
}

export function claudeBaseModel(model: string): string {
  return model.replace(/(?:\[1m\])+$/iu, '')
}

export function nativeModel(toolId: ToolId, preset: ModelPreset): string {
  if (baseToolId(toolId) !== 'claude-code') return preset.model
  const model = claudeBaseModel(preset.model)
  return preset.options.context1m ? `${model}[1m]` : model
}

export type AttributionStatus = 'default' | 'hidden' | 'custom'
export function attributionStatus(root: ConfigObject): AttributionStatus {
  const value = root.attribution
  if (
    value === false ||
    (isObject(value) && value.commit === '' && value.pr === '' && value.sessionUrl === false)
  )
    return 'hidden'
  return value === undefined ? 'default' : 'custom'
}

export interface CommonField {
  path: ConfigPath
  label: string
  choices?: readonly (readonly [string, string])[]
  kind?: 'text' | 'integer' | 'bytes' | 'disable'
  hint?: string
}
export const DEFAULT_CHOICES = [
  ['default', '工具默认'],
  ['true', '启用'],
  ['false', '禁用']
] as const
export const COMMON_FIELDS: Record<ReturnType<typeof baseToolId>, CommonField[]> = {
  'claude-code': [
    {
      path: ['effortLevel'],
      label: '思考强度',
      choices: CLAUDE_EFFORTS.map((effort) => [effort, effort] as const),
      hint: '顶层配置，适用于所有模型；切换供应商或模型后继续沿用。'
    },
    {
      path: ['env', 'ENABLE_TOOL_SEARCH'],
      label: '工具搜索（MCP Tool Search）',
      choices: [
        ['default', '工具默认'],
        ['true', '启用'],
        ['false', '禁用'],
        ['auto', '自动']
      ]
    },
    {
      path: ['env', 'DISABLE_AUTOUPDATER'],
      label: '禁用后台自动更新',
      kind: 'disable',
      hint: '仅控制 Claude Code 后台更新，不控制包管理器。'
    },
    {
      path: ['autoUpdatesChannel'],
      label: '更新渠道',
      choices: [
        ['default', '工具默认'],
        ['stable', 'stable'],
        ['latest', 'latest']
      ]
    },
    { path: ['autoMemoryEnabled'], label: '自动记忆', choices: DEFAULT_CHOICES },
    { path: ['language'], label: '回复语言', kind: 'text', hint: '留空使用工具默认，例如：中文。' },
    { path: ['env', 'DISABLE_TELEMETRY'], label: '禁用遥测', kind: 'disable' },
    { path: ['env', 'DISABLE_ERROR_REPORTING'], label: '禁用错误报告', kind: 'disable' },
    {
      path: ['env', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'],
      label: '禁用非必要网络流量',
      kind: 'disable',
      hint: '会同时禁用自动更新、遥测和错误报告；这些项目的独立设置可能被覆盖。'
    },
    {
      path: ['cleanupPeriodDays'],
      label: '会话保留天数',
      kind: 'integer',
      hint: '留空恢复默认；至少 1 天。删除过期会话后无法撤销。'
    }
  ],
  codex: [
    {
      path: ['model_reasoning_effort'],
      label: '思考强度',
      choices: CODEX_EFFORTS.map((effort) => [effort, effort] as const),
      hint: '顶层配置，适用于所有模型；实际支持的强度由当前模型和网关决定。'
    },
    {
      path: ['web_search'],
      label: '网络搜索',
      choices: [
        ['default', '工具默认'],
        ['disabled', '禁用'],
        ['cached', '缓存搜索'],
        ['live', '实时搜索']
      ]
    },
    {
      path: ['check_for_update_on_startup'],
      label: '启动时检查更新',
      choices: DEFAULT_CHOICES,
      hint: '仅控制 Codex CLI 启动检查，不控制桌面应用更新。'
    },
    {
      path: ['history', 'persistence'],
      label: '历史持久化',
      choices: [
        ['default', '工具默认'],
        ['save-all', '保存全部'],
        ['none', '不保存']
      ]
    },
    {
      path: ['history', 'max_bytes'],
      label: '历史文件大小',
      kind: 'bytes',
      hint: '留空不设置上限；超过上限时工具丢弃最早记录。'
    },
    { path: ['analytics', 'enabled'], label: '使用分析', choices: DEFAULT_CHOICES }
  ]
}

/** Apply a draft delta while retaining fields added outside the saved template. */
export function mergeTemplate(
  current: ConfigObject,
  next: ConfigObject,
  previous: ConfigObject = {}
): ConfigObject {
  const result = structuredClone(current)
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('配置字段名称不受支持。')
    if (!Object.hasOwn(next, key)) {
      if (isObject(previous[key]) && isObject(result[key])) {
        result[key] = mergeTemplate(result[key], {}, previous[key])
        if (!Object.keys(result[key] as ConfigObject).length) delete result[key]
      } else if (
        Array.isArray(previous[key]) &&
        Array.isArray(result[key]) &&
        [...previous[key], ...result[key]].every((item) => typeof item === 'string')
      ) {
        const removed = new Set(previous[key])
        const retained = result[key].filter((item) => !removed.has(item))
        if (retained.length) result[key] = retained
        else delete result[key]
      } else delete result[key]
    } else if (isObject(next[key]))
      result[key] = mergeTemplate(
        isObject(result[key]) ? result[key] : {},
        next[key],
        isObject(previous[key]) ? previous[key] : {}
      )
    else if (
      Array.isArray(next[key]) &&
      Array.isArray(previous[key]) &&
      Array.isArray(result[key]) &&
      [...next[key], ...previous[key], ...result[key]].every((item) => typeof item === 'string')
    ) {
      const nextItems = next[key] as unknown[]
      const removed = new Set(previous[key].filter((item) => !nextItems.includes(item)))
      result[key] = [
        ...new Set([...result[key].filter((item) => !removed.has(item)), ...next[key]])
      ]
    } else result[key] = structuredClone(next[key])
  }
  return result
}

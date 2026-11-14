import { applyEdits, modify, parse, parseTree, type ParseError } from 'jsonc-parser'
import { isDeepStrictEqual } from 'node:util'
import { isObject } from '@shared/configuration'
import type { CopilotConfiguration, CopilotModel } from '@shared/copilot'
import { AppError } from '../errors'

type CopilotClientConfiguration = Pick<CopilotConfiguration, 'name' | 'vendor' | 'models'> & {
  apiKey?: string
  [key: string]: unknown
}

/** VS Code sorts custom provider groups by name, independently of their JSON array order. */
export function copilotClientName(name: string, position: number, count: number): string {
  return `${String(position + 1).padStart(Math.max(2, String(count).length), '0')}-${name}`
}

/** Strip only a recognized client prefix; an original name can itself start with digits. */
export function copilotProviderName(
  name: string,
  providerNames: ReadonlySet<string>,
  appliedNames: ReadonlyMap<string, string>
): string {
  const original = appliedNames.get(name)
  if (original !== undefined) return original
  if (providerNames.has(name)) return name
  const unprefixed = name.replace(/^\d{2,}-/u, '')
  return providerNames.has(unprefixed) ? unprefixed : name
}

const AUTH_HEADERS = new Set(['authorization', 'api-key', 'x-api-key', 'x-goog-api-key', 'apikey'])
const MODEL_FIELD_ORDER = [
  'id',
  'name',
  'url',
  'requestHeaders',
  'apiType',
  'maxInputTokens',
  'maxOutputTokens',
  'toolCalling',
  'vision',
  'streaming',
  'thinking',
  'zeroDataRetentionEnabled',
  'statefulResponses',
  'supportsReasoningEffort'
]

function orderCopilotModelFields(model: CopilotModel): CopilotModel {
  return Object.fromEntries(
    [...new Set([...MODEL_FIELD_ORDER, ...Object.keys(model)])]
      .filter((field) => Object.hasOwn(model, field))
      .map((field) => [field, model[field]])
  ) as CopilotModel
}

/** VS Code resolves top-level apiKey exclusively through its own Secret Storage. */
export function buildCopilotClientConfiguration(
  configuration: CopilotConfiguration,
  name = configuration.name
): CopilotClientConfiguration {
  const { apiKey, ...group } = structuredClone(configuration)
  const secretReference = /^\$\{input:[^{}]+\}$/u.test(apiKey)

  return {
    ...group,
    name,
    ...(secretReference ? { apiKey } : {}),
    models: group.models.map((model) => {
      if (secretReference) return orderCopilotModelFields(model)
      const headers = Object.fromEntries(
        Object.entries(model.requestHeaders ?? {}).map(([name, value]) => [
          name,
          value.split('${apiKey}').join(apiKey)
        ])
      )
      if (apiKey && !Object.keys(headers).some((name) => AUTH_HEADERS.has(name.toLowerCase()))) {
        if ((model.apiType ?? group.apiType) === 'messages') headers['x-api-key'] = apiKey
        else if (model.url.includes('openai.azure')) headers['api-key'] = apiKey
        else headers.Authorization = `Bearer ${apiKey}`
      }
      return orderCopilotModelFields(
        Object.keys(headers).length || model.requestHeaders
          ? { ...model, requestHeaders: headers }
          : model
      )
    })
  }
}

/** A native JSONC array, independent of CLI object/TOML configuration. */
export function parseCopilotDocument(content: string | null): unknown[] {
  if (content === null) return []
  const errors: ParseError[] = []
  const options = { allowTrailingComma: true, disallowComments: false }
  const value: unknown = parse(content, errors, options)
  const tree = parseTree(content, [], options)
  let duplicate = false
  const visit = (node: typeof tree): void => {
    if (node?.type === 'object') {
      const keys = node.children?.map((property) => property.children?.[0].value) ?? []
      if (new Set(keys).size !== keys.length) duplicate = true
    }
    node?.children?.forEach(visit)
  }
  visit(tree)
  if (errors.length || !Array.isArray(value) || value.some((item) => !isObject(item)) || duplicate)
    throw new AppError(
      'MALFORMED_CONFIG',
      'chatLanguageModels.json 必须是供应商对象数组，且不能含重复字段。请在 VS Code 中修复 JSONC 后重试，原文件未修改。'
    )
  return value
}

export function copilotGroupIndex(groups: unknown[], name: string): number {
  const matches = groups.flatMap((group, index) =>
    isObject(group) && group.vendor === 'customendpoint' && group.name === name ? [index] : []
  )
  if (matches.length > 1)
    throw new AppError(
      'CONCURRENT_MODIFICATION',
      'VS Code 中存在同名模型分组，请先重命名重复分组。'
    )
  return matches[0] ?? -1
}

/** Renumber an unchanged managed group without rewriting models, credentials or comments. */
export function renameCopilotGroup(content: string, index: number, name: string): string {
  const result = applyEdits(content, modify(content, [index, 'name'], name, editOptions(content)))
  parseCopilotDocument(result)
  return result
}

function editOptions(content: string): {
  formattingOptions: { insertSpaces: boolean; tabSize: number; eol: string }
} {
  return {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: content.includes('\r\n') ? '\r\n' : '\n'
    }
  }
}

/** Replace unowned groups; update managed properties while preserving unrelated JSONC. */
export function updateCopilotGroup(
  content: string | null,
  index: number,
  next: CopilotClientConfiguration | undefined,
  previous?: CopilotClientConfiguration
): string {
  let result = content ?? '[]\n'
  const options = editOptions(result)
  const edit = (path: (string | number)[], value: unknown): void => {
    result = applyEdits(result, modify(result, path, value, options))
  }
  if (index < 0) edit([-1], next)
  else if (next === undefined) edit([index], undefined)
  else if (!previous) {
    if (!isDeepStrictEqual(parseCopilotDocument(result)[index], next)) edit([index], next)
  } else {
    const current = parseCopilotDocument(result)[index] as Record<string, unknown>
    for (const key of new Set([...Object.keys(previous ?? {}), ...Object.keys(next)])) {
      if (key === 'models') {
        const models = Array.isArray(current.models) ? current.models : []
        // Model identity and order are owned by this group. Preserve comments when unchanged.
        if (
          models.length === next.models.length &&
          models.every((m, i) => isObject(m) && m.id === next.models[i].id)
        ) {
          next.models.forEach((model, i) => {
            const before = previous?.models.find((m) => m.id === model.id)
            for (const field of new Set([...Object.keys(before ?? {}), ...Object.keys(model)]))
              if (!isDeepStrictEqual((models[i] as Record<string, unknown>)[field], model[field]))
                edit([index, 'models', i, field], model[field])
          })
        } else if (!isDeepStrictEqual(current.models, next.models)) edit([index, key], next.models)
      } else if (!isDeepStrictEqual(current[key], next[key])) edit([index, key], next[key])
    }
  }
  if (next && index >= 0) {
    const current = parseCopilotDocument(result)[index] as CopilotClientConfiguration
    next.models.forEach((model, modelIndex) => {
      // Value equality ignores object key order; normalize existing models on reapply too.
      if (!isDeepStrictEqual(Object.keys(current.models[modelIndex]), Object.keys(model)))
        edit([index, 'models', modelIndex], model)
    })
  }
  parseCopilotDocument(result)
  return result
}

/** Redact every credential field/header, including credentials of external groups. */
export function redactCopilotDocument(content: string): string {
  const scrub = (value: unknown, key = ''): unknown => {
    if (
      /(?:api[-_]?key|secret|password|authorization|credential|headers|^(?:access|auth|refresh|bearer)?[_-]?token$)/iu.test(
        key
      )
    )
      return '••••••'
    if (Array.isArray(value)) return value.map((item) => scrub(item))
    if (isObject(value))
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, scrub(item, name)])
      )
    if (typeof value === 'string' && /^https?:/iu.test(value)) {
      try {
        const url = new URL(value)
        if (url.username) url.username = 'REDACTED'
        if (url.password) url.password = 'REDACTED'
        for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, 'REDACTED')
        return url.toString()
      } catch {
        return '[地址已脱敏]'
      }
    }
    return value
  }
  return `${JSON.stringify(scrub(parseCopilotDocument(content)), null, 2)}\n`
}

import { AppError } from '../errors'
import { parse } from 'smol-toml'

export function validateCodexToml(content: string): Record<string, unknown> {
  try {
    return parse(content)
  } catch {
    throw new AppError(
      'MALFORMED_CONFIG',
      'Codex 配置不是有效的 TOML，请检查语法、重复字段和表定义后重试。'
    )
  }
}

interface TomlHeader {
  name: string
  array: boolean
}

interface TomlAssignment {
  key: string
  rawValue: string
}

interface ScannedLine {
  text: string
  structural: boolean
}

type MultilineQuote = 'basic' | 'literal'

export interface CodexTomlValues {
  model: string | null
  modelProvider: string | null
  baseUrl: string | null
  apiKey: string | null
  wireApi: string | null
  requiresOpenaiAuth: boolean | null
}

export interface CodexTomlUpdate {
  providerTable: string
  providerName: string
  baseUrl: string
  model: string
  apiKey: string
}

export function readCodexToml(content: string | null): CodexTomlValues {
  if (content === null || content.trim().length === 0) {
    return {
      model: null,
      modelProvider: null,
      baseUrl: null,
      apiKey: null,
      wireApi: null,
      requiresOpenaiAuth: null
    }
  }

  const root = validateCodexToml(content)

  const lines = scanTomlLines(splitLines(content))
  const model = readStringFromSection(lines, null, 'model')
  const modelProvider = readStringFromSection(lines, null, 'model_provider')
  if (!modelProvider) {
    return {
      model,
      modelProvider,
      baseUrl: null,
      apiKey: null,
      wireApi: null,
      requiresOpenaiAuth: null
    }
  }

  const sectionName = `model_providers.${modelProvider}`
  const providers = root.model_providers
  const provider =
    providers && typeof providers === 'object'
      ? (providers as Record<string, unknown>)[modelProvider]
      : null
  const requiresOpenaiAuth =
    provider && typeof provider === 'object' && 'requires_openai_auth' in provider
      ? provider.requires_openai_auth
      : null
  return {
    model,
    modelProvider,
    baseUrl: readStringFromSection(lines, sectionName, 'base_url'),
    apiKey: readStringFromSection(lines, sectionName, 'experimental_bearer_token'),
    wireApi: readStringFromSection(lines, sectionName, 'wire_api'),
    requiresOpenaiAuth: typeof requiresOpenaiAuth === 'boolean' ? requiresOpenaiAuth : null
  }
}

export function updateCodexToml(content: string | null, update: CodexTomlUpdate): string {
  if (content !== null) {
    readCodexToml(content)
  }

  const newline = content?.includes('\r\n') ? '\r\n' : '\n'
  const sourceLines = content === null ? [] : scanTomlLines(splitLines(content))
  const preservedLines: string[] = []
  let currentSection: string | null = null

  for (const line of sourceLines) {
    const header = line.structural ? parseHeader(line.text) : null
    if (header) currentSection = header.name

    if (currentSection?.startsWith('model_providers.ai-switch-')) {
      continue
    }

    if (currentSection === null) {
      const assignment = line.structural ? parseAssignment(line.text) : null
      if (assignment?.key === 'model' || assignment?.key === 'model_provider') {
        continue
      }
    }

    preservedLines.push(line.text)
  }

  while (preservedLines[0]?.trim() === '') preservedLines.shift()
  while (preservedLines.at(-1)?.trim() === '') preservedLines.pop()

  const result = [
    `model = ${encodeTomlString(update.model)}`,
    `model_provider = ${encodeTomlString(update.providerTable)}`
  ]

  if (preservedLines.length > 0) {
    result.push('', ...preservedLines)
  }

  result.push(
    '',
    `[model_providers.${update.providerTable}]`,
    `name = ${encodeTomlString(update.providerName)}`,
    `base_url = ${encodeTomlString(update.baseUrl)}`,
    'wire_api = "responses"',
    `experimental_bearer_token = ${encodeTomlString(update.apiKey)}`,
    'requires_openai_auth = false'
  )

  return `${result.join(newline)}${newline}`
}

function readStringFromSection(
  lines: ScannedLine[],
  expectedSection: string | null,
  expectedKey: string
): string | null {
  const matches: string[] = []
  let currentSection: string | null = null

  for (const line of lines) {
    if (!line.structural) continue
    const header = parseHeader(line.text)
    if (header) {
      currentSection = header.name
      continue
    }

    if (currentSection !== expectedSection) continue
    const assignment = parseAssignment(line.text)
    if (assignment?.key !== expectedKey) continue
    const value = decodeTomlString(assignment.rawValue)
    if (value === null) {
      throw malformedTomlError()
    }
    matches.push(value)
  }

  if (matches.length > 1) throw malformedTomlError()
  return matches[0] ?? null
}

function scanTomlLines(lines: string[]): ScannedLine[] {
  let multilineQuote: MultilineQuote | null = null
  const scanned: ScannedLine[] = []

  for (const text of lines) {
    const structural = multilineQuote === null
    multilineQuote = advanceMultilineQuote(text, multilineQuote)
    scanned.push({ text, structural })
  }

  if (multilineQuote !== null) throw malformedTomlError()
  return scanned
}

function advanceMultilineQuote(
  line: string,
  initialQuote: MultilineQuote | null
): MultilineQuote | null {
  let quote = initialQuote
  let index = 0

  while (index < line.length) {
    if (quote !== null) {
      const delimiter = quote === 'basic' ? '"""' : "'''"
      const closeIndex = findMultilineClose(line, delimiter, index, quote === 'basic')
      if (closeIndex < 0) return quote
      quote = null
      index = closeIndex + delimiter.length
      continue
    }

    if (line[index] === '#') return null
    if (line.startsWith('"""', index)) {
      quote = 'basic'
      index += 3
      continue
    }
    if (line.startsWith("'''", index)) {
      quote = 'literal'
      index += 3
      continue
    }
    if (line[index] === '"' || line[index] === "'") {
      index = skipInlineString(line, index, line[index] as '"' | "'")
      continue
    }
    index += 1
  }

  return quote
}

function findMultilineClose(
  line: string,
  delimiter: string,
  startIndex: number,
  escaped: boolean
): number {
  let index = line.indexOf(delimiter, startIndex)
  while (index >= 0) {
    if (!escaped || countPreviousBackslashes(line, index) % 2 === 0) return index
    index = line.indexOf(delimiter, index + 1)
  }
  return -1
}

function countPreviousBackslashes(value: string, index: number): number {
  let count = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    count += 1
  }
  return count
}

function skipInlineString(line: string, startIndex: number, quote: '"' | "'"): number {
  for (let index = startIndex + 1; index < line.length; index += 1) {
    if (quote === '"' && line[index] === '\\') {
      index += 1
      continue
    }
    if (line[index] === quote) return index + 1
  }
  throw malformedTomlError()
}

function splitLines(content: string): string[] {
  const lines = content.split(/\r?\n/u)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function parseHeader(line: string): TomlHeader | null {
  const text = stripComment(line).trim()
  if (text.startsWith('[[') && text.endsWith(']]')) {
    const name = normalizeDottedKey(text.slice(2, -2))
    return name ? { name, array: true } : null
  }

  if (text.startsWith('[') && text.endsWith(']') && !text.includes('=')) {
    const name = normalizeDottedKey(text.slice(1, -1))
    return name ? { name, array: false } : null
  }

  return null
}

function parseAssignment(line: string): TomlAssignment | null {
  const text = stripComment(line).trim()
  if (!text) return null
  const equalsIndex = findUnquotedCharacter(text, '=')
  if (equalsIndex < 1) return null

  const key = normalizeDottedKey(text.slice(0, equalsIndex))
  const rawValue = text.slice(equalsIndex + 1).trim()
  if (!key || !rawValue) return null
  return { key, rawValue }
}

function normalizeDottedKey(rawKey: string): string | null {
  const parts: string[] = []
  let current = ''
  let quote: 'single' | 'double' | null = null
  let escaped = false

  for (const character of rawKey.trim()) {
    if (quote === 'double') {
      current += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = null
      continue
    }
    if (quote === 'single') {
      current += character
      if (character === "'") quote = null
      continue
    }
    if (character === '"') {
      quote = 'double'
      current += character
    } else if (character === "'") {
      quote = 'single'
      current += character
    } else if (character === '.') {
      const part = decodeTomlKeyPart(current)
      if (part === null) return null
      parts.push(part)
      current = ''
    } else {
      current += character
    }
  }

  if (quote !== null) return null
  const lastPart = decodeTomlKeyPart(current)
  if (lastPart === null) return null
  parts.push(lastPart)
  return parts.join('.')
}

function decodeTomlKeyPart(rawPart: string): string | null {
  const part = rawPart.trim()
  if (/^[A-Za-z0-9_-]+$/u.test(part)) return part
  return decodeTomlString(part)
}

function decodeTomlString(rawValue: string): string | null {
  const value = rawValue.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value)
      return typeof parsed === 'string' ? parsed : null
    } catch {
      return null
    }
  }

  if (value.startsWith("'") && value.endsWith("'") && !value.slice(1, -1).includes("'")) {
    return value.slice(1, -1)
  }

  return null
}

function encodeTomlString(value: string): string {
  return JSON.stringify(value)
}

function stripComment(line: string): string {
  const commentIndex = findUnquotedCharacter(line, '#')
  return commentIndex < 0 ? line : line.slice(0, commentIndex)
}

function findUnquotedCharacter(value: string, expected: string): number {
  let quote: 'single' | 'double' | null = null
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote === 'double') {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = null
    } else if (quote === 'single') {
      if (character === "'") quote = null
    } else if (character === '"') {
      quote = 'double'
    } else if (character === "'") {
      quote = 'single'
    } else if (character === expected) {
      return index
    }
  }

  return -1
}

function malformedTomlError(): AppError {
  return new AppError(
    'MALFORMED_CONFIG',
    'Codex 配置中的供应商字段不是可识别的 TOML 字符串，请修复文件后重试。'
  )
}

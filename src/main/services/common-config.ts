import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { baseToolId, PROVIDER_TOOL_IDS, TOOL_IDS, type ToolId } from '@shared/ipc'
import {
  isObject,
  parseConfiguration,
  serializeConfiguration,
  type ConfigObject
} from '@shared/configuration'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'

export interface CommonTemplateSnapshot {
  content: string | null
  files: Record<string, string | null>
  warnings: string[]
}

/** Shared templates may contain secrets; keep them and legacy originals in app data. */
export class CommonConfigStore {
  constructor(private readonly rootPath: string) {}

  getPath(toolId: ToolId): string {
    return join(this.rootPath, `${baseToolId(toolId)}.common.v2.json`)
  }

  getLegacyPath(toolId: ToolId): string {
    return join(this.rootPath, `${toolId}.common.json`)
  }

  decode(content: string | null): string | null {
    if (content === null) return null
    try {
      const value: unknown = JSON.parse(content)
      if (
        !isObject(value) ||
        value.version !== 2 ||
        (value.content !== null && typeof value.content !== 'string')
      )
        throw new Error('Invalid shared template')
      return value.content
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '共通模板无法读取，原文件未修改。请从备份恢复后重试。'
      )
    }
  }

  encode(content: string | null): string {
    return `${JSON.stringify({ version: 2, content }, null, 2)}\n`
  }

  async read(toolId: ToolId): Promise<CommonTemplateSnapshot> {
    const path = this.getPath(toolId)
    const stored = await readOptionalText(path)
    if (stored !== null)
      return { content: this.decode(stored), files: { [path]: stored }, warnings: [] }
    const family = baseToolId(toolId)
    const nativePath = this.getLegacyPath(family)
    const wslPath = this.getLegacyPath(`${family}-wsl`)
    const [native, wsl] = await Promise.all([
      readOptionalText(nativePath),
      readOptionalText(wslPath)
    ])
    const merged = mergeTemplates(family, native, wsl)
    return {
      ...merged,
      files: { [path]: null, [nativePath]: native, [wslPath]: wsl }
    }
  }

  async exportPortable(): Promise<Record<ToolId, string | null>> {
    const shared = Object.fromEntries(
      await Promise.all(PROVIDER_TOOL_IDS.map(async (id) => [id, (await this.read(id)).content]))
    )
    // Keep the v3 cloud format readable by older clients; both entries carry the same template.
    return Object.fromEntries(TOOL_IDS.map((id) => [id, shared[baseToolId(id)]])) as Record<
      ToolId,
      string | null
    >
  }

  normalizePortable(configs: Record<ToolId, string | null>): Record<ToolId, string | null> {
    const shared = Object.fromEntries(
      PROVIDER_TOOL_IDS.map((id) => [
        id,
        mergeTemplates(id, configs[id], configs[`${id}-wsl`]).content
      ])
    )
    return Object.fromEntries(TOOL_IDS.map((id) => [id, shared[baseToolId(id)]])) as Record<
      ToolId,
      string | null
    >
  }

  async importPortable(configs: Record<ToolId, string | null>): Promise<void> {
    const shared = this.normalizePortable(configs)
    for (const toolId of PROVIDER_TOOL_IDS) {
      // An explicit null prevents legacy files from resurfacing after cloud restore.
      await writeTextAtomic(this.getPath(toolId), this.encode(shared[toolId]), true)
    }
  }
}

function mergeTemplates(
  toolId: ToolId,
  native: string | null,
  wsl: string | null
): Pick<CommonTemplateSnapshot, 'content' | 'warnings'> {
  if (native === null || wsl === null || native === wsl)
    return { content: native ?? wsl, warnings: [] }
  const current = parseConfiguration(toolId, native)
  const legacy = parseConfiguration(toolId, wsl)
  let hasConflict = false
  function merge(preferred: ConfigObject, fallback: ConfigObject): ConfigObject {
    return Object.fromEntries(
      [...new Set([...Object.keys(fallback), ...Object.keys(preferred)])].map((key) => {
        if (!Object.hasOwn(preferred, key)) return [key, fallback[key]]
        if (!Object.hasOwn(fallback, key)) return [key, preferred[key]]
        const left = preferred[key]
        const right = fallback[key]
        if (isObject(left) && isObject(right)) return [key, merge(left, right)]
        if (!isDeepStrictEqual(left, right)) hasConflict = true
        return [key, left]
      })
    )
  }
  const content = serializeConfiguration(toolId, merge(current, legacy))
  return {
    content,
    warnings: hasConflict
      ? ['原本机与 WSL 模板已合并，冲突字段沿用本机值。旧模板原文件保留在应用数据目录中。']
      : []
  }
}

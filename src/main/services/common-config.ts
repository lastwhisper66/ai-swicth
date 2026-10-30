import { join } from 'node:path'
import { baseToolId, PROVIDER_TOOL_IDS, TOOL_IDS, type ToolId } from '@shared/ipc'
import { isObject, parseConfiguration } from '@shared/configuration'
import { AppError } from '../errors'
import type { AppDatabase } from '../database'

export interface CommonTemplateSnapshot {
  content: string | null
  files: Record<string, string | null>
  warnings: string[]
}

export class CommonConfigStore {
  constructor(private readonly database: AppDatabase) {}

  getReference(toolId: ToolId): string {
    return `template:${baseToolId(toolId)}`
  }

  getLegacyPath(toolId: ToolId): string {
    return join(this.database.rootPath, `${toolId}.common.json`)
  }

  decode(content: string | null): string | null {
    return decodeCommonConfig(content)
  }

  encode(content: string | null): string {
    return `${JSON.stringify({ content }, null, 2)}\n`
  }

  async read(toolId: ToolId): Promise<CommonTemplateSnapshot> {
    const path = this.getReference(toolId)
    const stored = this.database.readRecord(path)
    return { content: this.decode(stored), files: { [path]: stored }, warnings: [] }
  }

  async exportPortable(): Promise<Record<ToolId, string | null>> {
    return this.exportPortableSync()
  }

  exportPortableSync(): Record<ToolId, string | null> {
    const shared = Object.fromEntries(
      PROVIDER_TOOL_IDS.map((id) => [
        id,
        this.decode(this.database.readRecord(this.getReference(id)))
      ])
    )
    return Object.fromEntries(TOOL_IDS.map((id) => [id, shared[baseToolId(id)]])) as Record<
      ToolId,
      string | null
    >
  }

  normalizePortable(
    configs: Partial<Record<ToolId, string | null>>
  ): Record<ToolId, string | null> {
    const shared = Object.fromEntries(
      PROVIDER_TOOL_IDS.map((id) => {
        // An explicit null is authoritative; never resurrect a WSL or local template.
        const content = Object.hasOwn(configs, id) ? configs[id] : configs[`${id}-wsl`]
        if (content !== null && typeof content !== 'string')
          throw new AppError('STORAGE_CORRUPTED', '备份缺少共通模板字段，未修改本地配置。')
        if (content !== null) parseConfiguration(id, content)
        return [id, content]
      })
    )
    return Object.fromEntries(TOOL_IDS.map((id) => [id, shared[baseToolId(id)]])) as Record<
      ToolId,
      string | null
    >
  }

  async importPortable(configs: Partial<Record<ToolId, string | null>>): Promise<void> {
    this.replacePortable(configs)
  }

  replacePortable(configs: Partial<Record<ToolId, string | null>>): void {
    const shared = this.normalizePortable(configs)
    this.database.transaction(() => {
      for (const toolId of PROVIDER_TOOL_IDS)
        this.database.writeRecord(this.getReference(toolId), this.encode(shared[toolId]))
    })
  }
}

export function decodeCommonConfig(content: string | null): string | null {
  if (content === null) return null
  try {
    const value: unknown = JSON.parse(content)
    if (
      !isObject(value) ||
      (value.version !== undefined && value.version !== 2) ||
      (value.content !== null && typeof value.content !== 'string')
    )
      throw new Error('Invalid shared template')
    return value.content
  } catch {
    throw new AppError('STORAGE_CORRUPTED', '共通模板无法读取，请检查数据或从备份恢复后重试。')
  }
}

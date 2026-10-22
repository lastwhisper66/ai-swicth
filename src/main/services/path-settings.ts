import { homedir } from 'node:os'
import { extname, isAbsolute, join, resolve } from 'node:path'
import type { ToolId, ToolPathSource } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'

const SETTINGS_VERSION = 1

interface PathSettingsDocument {
  version: number
  paths: Partial<Record<ToolId, string>>
}

export interface ResolvedToolPath {
  path: string
  source: ToolPathSource
}

export class PathSettingsStore {
  constructor(private readonly filePath: string) {}

  async get(toolId: ToolId): Promise<ResolvedToolPath> {
    const document = await this.load()
    const customPath = document.paths[toolId]
    if (customPath) return { path: customPath, source: 'custom' }

    const environmentPath = getEnvironmentPath(toolId)
    if (environmentPath) return { path: environmentPath, source: 'environment' }

    return { path: getDefaultPath(toolId), source: 'default' }
  }

  async set(toolId: ToolId, filePath: string): Promise<void> {
    const normalizedPath = validateToolPath(toolId, filePath)
    const document = await this.load()
    document.paths[toolId] = normalizedPath
    await this.save(document)
  }

  async reset(toolId: ToolId): Promise<void> {
    const document = await this.load()
    delete document.paths[toolId]
    await this.save(document)
  }

  private async load(): Promise<PathSettingsDocument> {
    const content = await readOptionalText(this.filePath)
    if (content === null) return { version: SETTINGS_VERSION, paths: {} }

    try {
      const value: unknown = JSON.parse(content)
      if (!isPathSettingsDocument(value)) throw new Error('Invalid path settings')
      return value
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '应用路径设置无法读取。原文件未被修改，请检查应用数据目录。'
      )
    }
  }

  private async save(document: PathSettingsDocument): Promise<void> {
    await writeTextAtomic(this.filePath, `${JSON.stringify(document, null, 2)}\n`, true)
  }
}

export function validateToolPath(toolId: ToolId, filePath: string): string {
  const normalizedPath = filePath.trim()
  const expectedExtension = toolId === 'claude-code' ? '.json' : '.toml'
  if (!normalizedPath || !isAbsolute(normalizedPath)) {
    throw new AppError('INVALID_INPUT', '配置路径必须是绝对文件路径。', {
      path: '请选择或输入绝对文件路径。'
    })
  }

  if (extname(normalizedPath).toLocaleLowerCase() !== expectedExtension) {
    throw new AppError('INVALID_INPUT', `该工具的配置文件必须使用 ${expectedExtension} 扩展名。`, {
      path: `请选择 ${expectedExtension} 文件。`
    })
  }

  return resolve(normalizedPath)
}

function getEnvironmentPath(toolId: ToolId): string | null {
  const directory =
    toolId === 'claude-code' ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME
  if (!directory?.trim()) return null
  return join(resolve(directory), toolId === 'claude-code' ? 'settings.json' : 'config.toml')
}

function getDefaultPath(toolId: ToolId): string {
  return toolId === 'claude-code'
    ? join(homedir(), '.claude', 'settings.json')
    : join(homedir(), '.codex', 'config.toml')
}

function isPathSettingsDocument(value: unknown): value is PathSettingsDocument {
  if (!isRecord(value) || value.version !== SETTINGS_VERSION || !isRecord(value.paths)) {
    return false
  }

  return Object.entries(value.paths).every(([toolId, filePath]) => {
    if (
      !TOOL_IDS.includes(toolId as ToolId) ||
      typeof filePath !== 'string' ||
      !isAbsolute(filePath)
    ) {
      return false
    }
    const expectedExtension = toolId === 'claude-code' ? '.json' : '.toml'
    return extname(filePath).toLocaleLowerCase() === expectedExtension
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import { homedir } from 'node:os'
import { stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import type { ToolId, ToolPathSource } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'

const SETTINGS_VERSION = 2

interface PathSettingsDocument {
  version: number
  paths: Partial<Record<ToolId, string>>
}

export interface ResolvedToolPath {
  path: string
  directory: string
  source: ToolPathSource
}

export class PathSettingsStore {
  constructor(private readonly filePath: string) {}

  async get(toolId: ToolId): Promise<ResolvedToolPath> {
    const document = await this.load()
    const customPath = document.paths[toolId]
    if (customPath) return resolveToolPath(toolId, customPath, 'custom')

    const environmentPath = getEnvironmentPath(toolId)
    if (environmentPath) return resolveToolPath(toolId, environmentPath, 'environment')

    return resolveToolPath(toolId, getDefaultPath(toolId), 'default')
  }

  async set(toolId: ToolId, directory: string): Promise<void> {
    const normalizedPath = validateToolPath(directory)
    try {
      if (!(await stat(normalizedPath)).isDirectory()) {
        throw new AppError('INVALID_INPUT', '请选择工具的配置目录，而不是配置文件。')
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new AppError('PATH_NOT_FOUND', '配置目录不存在，请先创建目录再保存。')
      }
      throw error
    }
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
      if (value.version === 1) {
        value.paths = Object.fromEntries(
          Object.entries(value.paths).map(([toolId, filePath]) => [toolId, dirname(filePath)])
        )
        value.version = SETTINGS_VERSION
      }
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

export function validateToolPath(directory: string): string {
  const normalizedPath = directory.trim()
  if (!normalizedPath || !isAbsolute(normalizedPath)) {
    throw new AppError('INVALID_INPUT', '配置目录必须是绝对路径。', {
      path: '请选择或输入配置目录的绝对路径。'
    })
  }

  return resolve(normalizedPath)
}

function getEnvironmentPath(toolId: ToolId): string | null {
  const directory =
    toolId === 'claude-code' ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME
  if (!directory?.trim()) return null
  return resolve(directory)
}

function getDefaultPath(toolId: ToolId): string {
  return toolId === 'claude-code' ? join(homedir(), '.claude') : join(homedir(), '.codex')
}

function resolveToolPath(
  toolId: ToolId,
  directory: string,
  source: ToolPathSource
): ResolvedToolPath {
  return {
    directory,
    path: join(directory, toolId === 'claude-code' ? 'settings.json' : 'config.toml'),
    source
  }
}

function isPathSettingsDocument(value: unknown): value is PathSettingsDocument {
  if (
    !isRecord(value) ||
    ![1, SETTINGS_VERSION].includes(value.version as number) ||
    !isRecord(value.paths)
  ) {
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
    return (
      value.version === SETTINGS_VERSION ||
      extname(filePath).toLocaleLowerCase() === expectedExtension
    )
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

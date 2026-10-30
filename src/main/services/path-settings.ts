import { baseToolId, isWslTool } from '@shared/ipc'
import { homedir } from 'node:os'
import { stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import type { ToolId, ToolPathSource } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { AppError } from '../errors'
import type { AppDatabase } from '../database'
import { parseWslPath, WslService } from './wsl'

interface PathSettingsDocument {
  paths: Partial<Record<ToolId, string>>
}

export interface ResolvedToolPath {
  path: string
  directory: string
  source: ToolPathSource
  distribution?: string
  unavailableReason?: string
}

export class PathSettingsStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly wsl: WslService
  ) {}

  refresh(): void {
    this.wsl.refresh()
  }

  async get(toolId: ToolId): Promise<ResolvedToolPath> {
    const document = await this.load()
    const customPath = document.paths[toolId]
    if (isWslTool(toolId)) {
      try {
        const location = await this.wsl.getLocation(toolId, customPath)
        return {
          ...resolveToolPath(
            toolId,
            location.directory,
            customPath ? 'custom' : location.environmentOverride ? 'environment' : 'default'
          ),
          distribution: location.distribution
        }
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'WSL_UNAVAILABLE') throw error
        return {
          ...(customPath
            ? resolveToolPath(toolId, customPath, 'custom')
            : { path: '', directory: '', source: 'default' as const }),
          unavailableReason: error.message
        }
      }
    }
    if (customPath) return resolveToolPath(toolId, customPath, 'custom')

    const environmentPath = getEnvironmentPath(toolId)
    if (environmentPath) return resolveToolPath(toolId, environmentPath, 'environment')

    return resolveToolPath(toolId, getDefaultPath(toolId), 'default')
  }

  async getPickerDirectory(toolId: ToolId): Promise<string> {
    const location = await this.get(toolId)
    if (isWslTool(toolId) && location.unavailableReason) return '\\\\wsl.localhost\\'
    let { directory } = location
    while (true) {
      try {
        if ((await stat(directory)).isDirectory()) return directory
      } catch (error) {
        if (
          !(error instanceof Error && 'code' in error) ||
          (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
        ) {
          throw error
        }
      }
      const parent = dirname(directory)
      if (parent === directory) {
        throw new AppError('PATH_NOT_FOUND', '找不到可打开的上级目录，请检查配置路径。')
      }
      directory = parent
    }
  }

  async set(toolId: ToolId, directory: string): Promise<void> {
    const normalizedPath = isWslTool(toolId)
      ? parseWslPath(directory).directory
      : validateToolPath(directory)
    if (isWslTool(toolId)) await this.wsl.getLocation(toolId, normalizedPath)
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

  async getAvailable(toolId: ToolId): Promise<ResolvedToolPath> {
    const location = await this.get(toolId)
    if (location.unavailableReason) {
      throw new AppError('WSL_UNAVAILABLE', location.unavailableReason)
    }
    return location
  }

  async checkBackupTarget(toolId: ToolId, targetPath: string): Promise<void> {
    if (isWslTool(toolId)) await this.wsl.getLocation(toolId, dirname(targetPath))
  }

  async reset(toolId: ToolId): Promise<void> {
    const document = await this.load()
    delete document.paths[toolId]
    await this.save(document)
  }

  private async load(): Promise<PathSettingsDocument> {
    try {
      const rows = this.database.sql
        .prepare('SELECT tool_id, path FROM tool_paths')
        .all() as Array<{ tool_id: ToolId; path: string }>
      return decodePathSettings({ paths: Object.fromEntries(rows.map((r) => [r.tool_id, r.path])) })
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '应用路径设置无法读取。原文件未被修改，请检查应用数据目录。'
      )
    }
  }

  private async save(document: PathSettingsDocument): Promise<void> {
    this.database.transaction(() => {
      this.database.sql.prepare('DELETE FROM tool_paths').run()
      const insert = this.database.sql.prepare('INSERT INTO tool_paths VALUES (?, ?)')
      for (const [id, path] of Object.entries(document.paths)) insert.run(id, path)
    })
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
    baseToolId(toolId) === 'claude-code' ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME
  if (!directory?.trim()) return null
  return resolve(directory)
}

function getDefaultPath(toolId: ToolId): string {
  return baseToolId(toolId) === 'claude-code'
    ? join(homedir(), '.claude')
    : join(homedir(), '.codex')
}

function resolveToolPath(
  toolId: ToolId,
  directory: string,
  source: ToolPathSource
): ResolvedToolPath {
  return {
    directory,
    path: join(directory, baseToolId(toolId) === 'claude-code' ? 'settings.json' : 'config.toml'),
    source
  }
}

export function decodePathSettings(value: unknown): PathSettingsDocument {
  if (
    !isRecord(value) ||
    (value.version !== undefined && value.version !== 1 && value.version !== 2) ||
    !isRecord(value.paths)
  ) {
    throw new Error('Invalid path settings')
  }

  const paths: PathSettingsDocument['paths'] = {}
  for (const [toolId, filePath] of Object.entries(value.paths)) {
    if (
      !TOOL_IDS.includes(toolId as ToolId) ||
      typeof filePath !== 'string' ||
      !isAbsolute(filePath)
    ) {
      throw new Error('Invalid path settings')
    }
    const expectedExtension = baseToolId(toolId as ToolId) === 'claude-code' ? '.json' : '.toml'
    if (value.version === 1 && extname(filePath).toLocaleLowerCase() !== expectedExtension)
      throw new Error('Invalid legacy path settings')
    paths[toolId as ToolId] = value.version === 1 ? dirname(filePath) : filePath
  }
  return { paths }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

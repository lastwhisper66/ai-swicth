import type { ToolId, ToolStatus } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import type { ToolAdapter } from '../adapters/types'
import { AppError, isFileSystemError } from '../errors'
import type { ProviderStore, ResolvedProvider } from '../providers/store'
import { readOptionalText } from '../utils/files'
import type { PathSettingsStore } from './path-settings'
import type { ToolInstallationService } from './tool-installation'

export class ToolStatusService {
  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly adapters: Record<ToolId, ToolAdapter>,
    private readonly installations: ToolInstallationService
  ) {}

  async getAll(refreshInstallations = false): Promise<Record<ToolId, ToolStatus>> {
    const [claudeCode, codex] = await Promise.all([
      this.get('claude-code', refreshInstallations),
      this.get('codex', refreshInstallations)
    ])
    return { 'claude-code': claudeCode, codex }
  }

  async get(toolId: ToolId, refreshInstallations = false): Promise<ToolStatus> {
    const [resolvedPath, installation] = await Promise.all([
      this.pathSettings.get(toolId),
      this.installations.get(toolId, refreshInstallations)
    ])
    let content: string | null

    try {
      content = await readOptionalText(resolvedPath.path)
    } catch (error) {
      if (isFileSystemError(error) && (error.code === 'EACCES' || error.code === 'EPERM')) {
        return {
          toolId,
          installation,
          path: resolvedPath.path,
          directory: resolvedPath.directory,
          pathSource: resolvedPath.source,
          fileState: 'unreadable',
          statusMessage: '没有权限读取配置文件，请检查文件权限。',
          currentProviderId: null,
          currentProviderName: null,
          isExternalConfig: false,
          baseUrl: null,
          model: null
        }
      }

      throw error
    }

    if (content === null) {
      return {
        toolId,
        installation,
        path: resolvedPath.path,
        directory: resolvedPath.directory,
        pathSource: resolvedPath.source,
        fileState: 'missing',
        statusMessage:
          installation.state === 'installed'
            ? '工具已安装，配置文件尚不存在；首次应用时将创建。'
            : '配置文件尚不存在。此路径仅为预期配置位置，不能据此判断工具已安装。',
        currentProviderId: null,
        currentProviderName: null,
        isExternalConfig: false,
        baseUrl: null,
        model: null
      }
    }

    try {
      const current = this.adapters[toolId].parseCurrent(content)
      const providers = await this.providerStore.listResolved()
      const matchedProvider = providers.find((provider) =>
        providerMatches(toolId, provider, current.baseUrl, current.model, current.apiKey)
      )
      const hasConfiguration = Boolean(current.baseUrl || current.model || current.apiKey)

      return {
        toolId,
        installation,
        path: resolvedPath.path,
        directory: resolvedPath.directory,
        pathSource: resolvedPath.source,
        fileState: 'ready',
        statusMessage: matchedProvider
          ? `当前使用 ${matchedProvider.name}。`
          : toolId === 'codex' && current.model && !current.apiKey
            ? 'config.toml 中尚未保存 API Key，请选择已保存的供应商并重新应用。'
            : hasConfiguration
              ? '当前配置不匹配任何已保存供应商。'
              : '配置文件可读取，但尚未设置供应商。',
        currentProviderId: matchedProvider?.id ?? null,
        currentProviderName: matchedProvider?.name ?? null,
        isExternalConfig: hasConfiguration && !matchedProvider,
        baseUrl: current.baseUrl,
        model: current.model
      }
    } catch (error) {
      if (error instanceof AppError && error.code === 'MALFORMED_CONFIG') {
        return {
          toolId,
          installation,
          path: resolvedPath.path,
          directory: resolvedPath.directory,
          pathSource: resolvedPath.source,
          fileState: 'invalid',
          statusMessage: error.message,
          currentProviderId: null,
          currentProviderName: null,
          isExternalConfig: false,
          baseUrl: null,
          model: null
        }
      }

      throw error
    }
  }
}

function providerMatches(
  toolId: ToolId,
  provider: ResolvedProvider,
  baseUrl: string | null,
  model: string | null,
  apiKey: string | null
): boolean {
  return (
    provider.tools.includes(toolId) &&
    provider.baseUrl === baseUrl &&
    provider.models[toolId] === model &&
    provider.apiKey === apiKey
  )
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && TOOL_IDS.includes(value as ToolId)
}

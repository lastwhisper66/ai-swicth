import { baseToolId, isWslTool } from '@shared/ipc'
import type { ToolId, ToolStatus } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { nativeModel, type ModelPreset } from '@shared/configuration'
import { isDeepStrictEqual } from 'node:util'
import type { ToolAdapter } from '../adapters/types'
import { AppError, isFileSystemError } from '../errors'
import type { ProviderStore, ResolvedProvider } from '../providers/store'
import { hashContent, readOptionalText } from '../utils/files'
import type { PathSettingsStore } from './path-settings'
import type { ToolInstallationService } from './tool-installation'
import type { ManagedStateStore } from './managed-state'

export class ToolStatusService {
  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly adapters: Record<ToolId, ToolAdapter>,
    private readonly installations: ToolInstallationService,
    private readonly managedStates: ManagedStateStore
  ) {}

  async getAll(refreshInstallations = false): Promise<Record<ToolId, ToolStatus>> {
    if (refreshInstallations) this.pathSettings.refresh()
    return Object.fromEntries(
      await Promise.all(TOOL_IDS.map(async (id) => [id, await this.get(id, refreshInstallations)]))
    ) as Record<ToolId, ToolStatus>
  }

  async get(toolId: ToolId, refreshInstallations = false): Promise<ToolStatus> {
    const resolvedPath = await this.pathSettings.get(toolId)
    if (resolvedPath.unavailableReason) {
      return {
        toolId,
        installation: {
          state: 'unavailable',
          version: null,
          executablePath: null,
          message: resolvedPath.unavailableReason
        },
        path: resolvedPath.path,
        directory: resolvedPath.directory,
        pathSource: resolvedPath.source,
        fileState: 'unreadable',
        statusMessage: resolvedPath.unavailableReason,
        currentProviderId: null,
        currentProviderName: null,
        currentModelId: null,
        currentModelName: null,
        isExternalConfig: false,
        baseUrl: null,
        model: null
      }
    }
    const installation = await this.installations.get(
      toolId,
      refreshInstallations,
      resolvedPath.distribution
    )
    let content: string | null

    try {
      content = await readOptionalText(resolvedPath.path)
    } catch (error) {
      if (
        isFileSystemError(error) &&
        (isWslTool(toolId) || error.code === 'EACCES' || error.code === 'EPERM')
      ) {
        return {
          toolId,
          installation,
          path: resolvedPath.path,
          directory: resolvedPath.directory,
          pathSource: resolvedPath.source,
          fileState: 'unreadable',
          statusMessage: isWslTool(toolId)
            ? '无法读取 WSL 配置文件，请确认发行版可运行、配置路径有效且当前用户具有文件访问权限，然后刷新。'
            : '没有权限读取配置文件，请检查文件权限。',
          currentProviderId: null,
          currentProviderName: null,
          currentModelId: null,
          currentModelName: null,
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
        currentModelId: null,
        currentModelName: null,
        isExternalConfig: false,
        baseUrl: null,
        model: null
      }
    }

    try {
      const current = this.adapters[toolId].parseCurrent(content)
      const providers = await this.providerStore.listResolved()
      const adapter = this.adapters[toolId]
      const savedState = await this.managedStates.get(toolId)
      const state = savedState?.targetPath === resolvedPath.path ? savedState : null
      const externallyChanged = Boolean(
        state?.selection?.signature &&
        state.selection.signature !== hashContent(adapter.providerSignature(content))
      )
      const matches: Array<{ provider: ResolvedProvider; preset: ModelPreset }> = []
      for (const provider of providers) {
        const configuration = provider.configurations[baseToolId(toolId)]
        if (!configuration || !providerMatches(toolId, provider, current.baseUrl, current.apiKey))
          continue
        for (const preset of configuration.models) {
          if (nativeModel(toolId, preset) !== current.model) continue
          const applied = {
            providerId: provider.id,
            name: provider.name,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: nativeModel(toolId, preset),
            preset,
            configuration,
            version: installation.version
          }
          try {
            adapter.verify(content, applied)
            const generated = adapter.generate(content, applied, state?.fields)
            if (
              isDeepStrictEqual(
                adapter.providerSignature(content),
                adapter.providerSignature(generated.content)
              )
            )
              matches.push({ provider, preset })
          } catch {
            /* A preset with different options or an unsupported version is not a match. */
          }
        }
      }
      const selected = !externallyChanged
        ? (matches.find(
            ({ provider, preset }) =>
              provider.id === state?.selection?.providerId &&
              preset.id === state?.selection?.modelId
          ) ?? (matches.length === 1 ? matches[0] : undefined))
        : undefined
      const matchedProvider = selected?.provider
      const hasConfiguration = Boolean(current.baseUrl || current.model || current.apiKey)

      return {
        toolId,
        installation,
        path: resolvedPath.path,
        directory: resolvedPath.directory,
        pathSource: resolvedPath.source,
        fileState: 'ready',
        statusMessage: externallyChanged
          ? '供应商、模型选项或请求头已被外部修改，请检查当前预览后重新应用。'
          : matchedProvider
            ? `当前使用 ${matchedProvider.name} / ${selected?.preset.name}。已写入配置，服务能力未探测。`
            : matches.length > 1
              ? '当前文件匹配多个相同选项的预设，请应用其中一个以确认当前预设。'
              : baseToolId(toolId) === 'codex' && current.model && !current.apiKey
                ? 'config.toml 中尚未保存 API Key，请选择已保存的供应商并重新应用。'
                : hasConfiguration
                  ? '当前配置不匹配任何已保存供应商。'
                  : '配置文件可读取，但尚未设置供应商。',
        currentProviderId: matchedProvider?.id ?? null,
        currentProviderName: matchedProvider?.name ?? null,
        currentModelId: selected?.preset.id ?? null,
        currentModelName: selected?.preset.name ?? null,
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
          currentModelId: null,
          currentModelName: null,
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
  apiKey: string | null
): boolean {
  return (
    provider.tools.includes(baseToolId(toolId)) &&
    provider.baseUrl === baseUrl &&
    provider.apiKey === apiKey
  )
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && TOOL_IDS.includes(value as ToolId)
}

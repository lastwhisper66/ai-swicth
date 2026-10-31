import { posix, win32 } from 'node:path'
import { baseToolId, type ToolId, type ToolInstallation } from '@shared/ipc'
import { hasControlCharacters } from '@shared/configuration'
import { AppError } from '../errors'
import { parseToolVersion } from './tool-diagnostics'
import { WslRuntime } from './wsl-runtime'
import { getApplicationDefinition, type ApplicationId } from '@shared/applications'

interface WslEnvironment {
  distribution: string
  home: string
  claudeDirectory: string
  codexDirectory: string
}

export class WslService {
  private readonly environments = new Map<string, Promise<WslEnvironment>>()

  constructor(private readonly runtime = new WslRuntime()) {}

  refresh(): void {
    this.environments.clear()
    this.runtime.refresh()
  }

  async getLocation(
    toolId: ToolId,
    customDirectory?: string
  ): Promise<{
    directory: string
    distribution: string
    environmentOverride: boolean
  }> {
    const custom = customDirectory ? parseWslPath(customDirectory) : null
    const environment = await this.getEnvironment(custom?.distribution)
    const override =
      baseToolId(toolId) === 'claude-code'
        ? environment.claudeDirectory
        : environment.codexDirectory
    if (!custom && override && !posix.isAbsolute(override)) {
      throw new AppError(
        'WSL_UNAVAILABLE',
        'WSL 配置环境变量必须指向 Linux 绝对路径。请修正 CLAUDE_CONFIG_DIR / CODEX_HOME，或在配置路径中选择实际目录。'
      )
    }
    const linuxDirectory = posix.resolve(
      environment.home,
      override || (baseToolId(toolId) === 'claude-code' ? '.claude' : '.codex')
    )
    return {
      directory: custom?.directory ?? toWslPath(environment.distribution, linuxDirectory),
      distribution: environment.distribution,
      environmentOverride: Boolean(override)
    }
  }

  async detectInstallation(
    applicationId: ApplicationId,
    distribution: string
  ): Promise<ToolInstallation> {
    const definition = getApplicationDefinition(applicationId)
    const { command } = definition
    try {
      const result = await this.runtime.runCommand(
        command,
        [...definition.versionArgs],
        distribution
      )
      const diagnosis =
        result.exitCode === 0 ? parseToolVersion(applicationId, result.stdout) : null
      if (diagnosis && result.executablePath) {
        return {
          state: 'installed',
          ...diagnosis,
          executablePath: result.executablePath,
          message: `${distribution} 中的 ${command} 已安装，版本 ${diagnosis.version}。`
        }
      }
      return {
        state: result.failure === 'command-not-found' ? 'not-detected' : 'unavailable',
        version: null,
        executablePath: result.executablePath,
        message:
          result.failure === 'command-not-found'
            ? `未在 ${distribution} 用户 shell 的 PATH 中找到 Linux 版 ${command}。请把安装目录加入该用户的 shell 启动配置后刷新。`
            : `${distribution} 中的 ${command} 无法读取版本。请在该发行版运行 ${command} --version，检查启动文件及权限后刷新。`
      }
    } catch {
      return {
        state: 'unavailable',
        version: null,
        executablePath: null,
        message: `${distribution} 中的 ${command} 运行失败或超时。请在该发行版运行 ${command} --version，检查 shell 及 CLI 后刷新。`
      }
    }
  }

  private getEnvironment(distribution?: string): Promise<WslEnvironment> {
    const key = distribution ?? ''
    let pending = this.environments.get(key)
    if (!pending) {
      pending = this.readEnvironment(distribution)
      this.environments.set(key, pending)
    }
    return pending
  }

  private async readEnvironment(distribution?: string): Promise<WslEnvironment> {
    const environment = await this.runtime.readEnvironment(
      ['CLAUDE_CONFIG_DIR', 'CODEX_HOME'],
      distribution
    )
    return {
      distribution: environment.distribution,
      home: environment.home,
      claudeDirectory: environment.variables.CLAUDE_CONFIG_DIR,
      codexDirectory: environment.variables.CODEX_HOME
    }
  }
}

export function parseWslPath(directory: string): { directory: string; distribution: string } {
  const normalized = win32.normalize(directory.trim())
  const match = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/iu.exec(normalized)
  if (!match || hasControlCharacters(normalized)) {
    throw new AppError(
      'INVALID_INPUT',
      '请选择 WSL 发行版内的配置目录，例如 \\\\wsl.localhost\\Ubuntu\\home\\用户名\\.claude；不能使用 Windows 本机目录。'
    )
  }
  return { directory: normalized, distribution: match[1] }
}

function toWslPath(distribution: string, linuxPath: string): string {
  return `\\\\wsl.localhost\\${distribution}${linuxPath.replaceAll('/', '\\')}`
}

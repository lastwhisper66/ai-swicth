import type { ApplicationInstallationSource, NpmInstallation } from '@shared/ipc'
import {
  APPLICATION_INSTANCES,
  getApplicationDefinition,
  type ApplicationId
} from '@shared/applications'
import type { DoctorInstallMethod } from './tool-diagnostics'

type InstallationMethod = DoctorInstallMethod | 'node-package'

/** Paths provide source clues, never authorization to mutate an unmanaged installation. */
export function identifyInstallationSource(
  applicationId: ApplicationId,
  npm: NpmInstallation,
  executable: string,
  resolved: string,
  doctorMethod: DoctorInstallMethod | null = null
): ApplicationInstallationSource | null {
  const paths = [executable, resolved].map((path) => path.replaceAll('\\', '/').toLowerCase())
  const matches = (pattern: RegExp): boolean => paths.some((path) => pattern.test(path))
  const { npmPackage, command } = getApplicationDefinition(applicationId)
  const claude = APPLICATION_INSTANCES[applicationId].kind === 'claude-code'
  const codex = APPLICATION_INSTANCES[applicationId].kind === 'codex'
  const evidence = `启动文件：${executable}；实际文件：${resolved}。`
  if (npm.available && npm.managed) {
    return {
      label: 'npm 全局安装',
      evidence: `${evidence}已核对 npm 全局包和 bin 映射。`,
      uninstallHint: '可在此卸载当前环境的 npm 全局包，保留工具配置和历史记录。'
    }
  }
  let method: InstallationMethod | null = null
  if (matches(/\/(?:caskroom|cellar)\//u)) method = 'homebrew'
  else if (matches(/\/microsoft\/winget\/packages\//u)) method = 'winget'
  else if (matches(/\/scoop\/(?:apps|shims)\//u)) method = 'scoop'
  else if (matches(/\/(?:pnpm\/global|\.local\/share\/pnpm\/global|node_modules\/\.pnpm)\//u))
    method = 'pnpm'
  else if (matches(/\/\.bun\/install\/global\//u)) method = 'bun'
  else if (
    matches(
      /\/node_modules\/(?:@anthropic-ai\/claude-code|@openai\/codex|@google\/gemini-cli|@xai-official\/grok)\//u
    )
  )
    method = doctorMethod ?? 'node-package'
  else if (claude && matches(/\/\.local\/share\/claude\/versions\//u)) method = 'native'
  method ??= doctorMethod
  if (!method) return null
  const labels: Record<InstallationMethod, string> = {
    native: codex ? 'Codex 独立 CLI' : '原生二进制安装',
    'npm-global': 'npm（其他环境或副本）',
    'npm-local': 'npm 项目安装',
    homebrew: 'Homebrew',
    winget: 'WinGet',
    scoop: 'Scoop',
    'node-package': 'Node.js 包安装',
    pnpm: 'pnpm 安装',
    bun: 'Bun 全局安装'
  }
  const hints: Record<InstallationMethod, string> = {
    native: claude
      ? '请按 Claude Code 官方原生卸载说明，核对后移除启动文件及 ~/.local/share/claude 版本目录；保留 ~/.claude 配置目录。'
      : '请按实际文件位置核对独立 CLI 安装目录，通过原安装器卸载；手动安装的版本请自行移除启动文件及对应 PATH 项，保留 ~/.codex 用户数据。',
    'npm-global': `请进入原 Node.js / npm 环境，核对 npm prefix -g 后执行 npm uninstall -g ${npmPackage}。当前 npm 未确认拥有此副本。`,
    'npm-local': `请在原安装项目中核对依赖，使用 npm uninstall ${npmPackage}。`,
    homebrew: claude
      ? '请先用 brew list 核对安装项，再执行 brew uninstall --cask claude-code；若安装项为 claude-code@latest，请使用该名称。'
      : `请用 brew list 核对 ${command} 的 formula / cask 名称，再通过 brew uninstall 卸载对应安装项。`,
    winget: claude
      ? '请在 Windows 终端执行 winget uninstall Anthropic.ClaudeCode。'
      : '请用 winget list 核对包 ID，再执行 winget uninstall --id <包ID>。',
    scoop: '请用 scoop list 核对安装项，再执行 scoop uninstall <包名>。',
    'node-package': `路径位于 ${npmPackage} 包内，但目录结构不能确认包管理器。请在原 Node.js 环境或项目核对 npm / pnpm / Bun / Yarn 安装记录，再使用对应包管理器卸载。`,
    pnpm: `请用 pnpm list -g 核对；全局安装执行 pnpm remove -g ${npmPackage}，项目依赖则在原项目执行 pnpm remove ${npmPackage}。`,
    bun: `请在原 Bun 环境核对全局安装，再执行 bun remove -g ${npmPackage}。`
  }
  return {
    label: `${labels[method]}（${doctorMethod && method === doctorMethod ? 'doctor 报告' : '路径线索'}）`,
    evidence: `${evidence}${doctorMethod ? `doctor 安装类型：${doctorMethod}。` : '根据启动路径识别安装渠道，请在原包管理器中核对。'}`,
    uninstallHint: hints[method]
  }
}

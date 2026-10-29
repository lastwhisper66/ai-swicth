import { baseToolId, isWslTool } from '@shared/ipc'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import type { ToolId, ToolInstallation } from '@shared/ipc'
import { isFileSystemError } from '../errors'
import { findBundledCodexCli, getCodexCommandDirectories } from './codex-cli-location'
import type { WslService } from './wsl'
import { doctorArguments, parseToolDoctor, type CliCommandResult } from './tool-diagnostics'

const CACHE_DURATION = 30_000
const DETECTION_TIMEOUT = 20_000

export class ToolInstallationService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; result: Promise<ToolInstallation> }
  >()

  constructor(private readonly wsl: WslService) {}

  get(toolId: ToolId, refresh = false, distribution?: string): Promise<ToolInstallation> {
    const key = `${toolId}:${distribution ?? ''}`
    const cached = this.cache.get(key)
    if (cached && (!refresh || cached.expiresAt === Infinity) && cached.expiresAt > Date.now()) {
      return cached.result
    }
    const result = isWslTool(toolId)
      ? this.wsl.detectInstallation(toolId, distribution!)
      : detectInstallation(toolId)
    const entry = { expiresAt: Infinity, result }
    this.cache.set(key, entry)
    void result.then(
      () => {
        entry.expiresAt = Date.now() + CACHE_DURATION
      },
      () => {
        this.cache.delete(key)
      }
    )
    return result
  }
}

async function detectInstallation(toolId: ToolId): Promise<ToolInstallation> {
  const name = baseToolId(toolId) === 'claude-code' ? 'Claude Code' : 'Codex CLI'
  const command = baseToolId(toolId) === 'claude-code' ? 'claude' : 'codex'
  const candidates = getSearchDirectories(toolId).flatMap((directory) =>
    (process.platform === 'win32' ? [`${command}.exe`, `${command}.cmd`] : [command]).map(
      (fileName) => join(directory, fileName)
    )
  )
  let inaccessible = false
  let firstExecutablePath: string | null = null
  const seen = new Set<string>()

  async function inspectExecutables(
    paths: string[],
    bundled = false
  ): Promise<ToolInstallation | null> {
    const locations = await Promise.all(
      paths.map(async (candidate) => {
        try {
          if (!(await stat(candidate)).isFile()) return null
          await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
          return { path: candidate, realPath: await realpath(candidate) }
        } catch (error) {
          if (!isFileSystemError(error) || !['ENOENT', 'ENOTDIR'].includes(error.code ?? '')) {
            inaccessible = true
          }
          return null
        }
      })
    )
    const deadline = Date.now() + DETECTION_TIMEOUT

    for (const executable of locations) {
      if (!executable) continue
      const key =
        process.platform === 'win32' ? executable.realPath.toLowerCase() : executable.realPath
      if (seen.has(key)) continue
      seen.add(key)
      firstExecutablePath ??= executable.path
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      try {
        const result = await runDoctor(
          executable.path,
          doctorArguments(toolId),
          Math.min(12_000, remaining)
        )
        const diagnosis = parseToolDoctor(toolId, result.stdout)
        if (!diagnosis) continue
        return {
          state: 'installed',
          ...diagnosis,
          executablePath: executable.path,
          message: `${name} 已安装，版本 ${diagnosis.version}${bundled ? '（桌面版内置）' : ''}。`
        }
      } catch {
        // A stale launcher must not prevent checking another installation.
      }
    }
    return null
  }

  const installation = await inspectExecutables(candidates)
  if (installation) return installation

  if (baseToolId(toolId) === 'codex' && process.platform === 'win32') {
    try {
      const bundled = await inspectExecutables(await findBundledCodexCli(), true)
      if (bundled) return bundled
    } catch {
      inaccessible = true
    }
  }

  return {
    state: firstExecutablePath || inaccessible ? 'unavailable' : 'not-detected',
    version: null,
    executablePath: firstExecutablePath,
    message: firstExecutablePath
      ? `找到 ${name} 启动文件，但 doctor 未返回可识别的安装报告。请在终端运行 ${command} doctor，确认版本支持该命令并检查诊断结果后刷新。`
      : inaccessible
        ? `部分安装位置无法访问，暂时无法确认 ${name} 是否可用。请检查权限，并在终端运行 ${command} doctor。`
        : `未在本机 PATH 和常见安装位置检测到 ${name}。请先安装；已安装时请检查 PATH，并重启 AI Switch 后重新检测。`
  }
}

function getSearchDirectories(toolId: ToolId): string[] {
  const userHome = homedir()
  const directories = [
    ...(process.env.PATH ?? '').split(delimiter),
    join(userHome, '.local', 'bin'),
    join(userHome, '.bun', 'bin'),
    join(userHome, '.npm-global', 'bin')
  ]
  if (baseToolId(toolId) === 'codex') directories.push(...getCodexCommandDirectories())
  if (process.platform === 'win32') {
    if (process.env.APPDATA) directories.push(join(process.env.APPDATA, 'npm'))
    if (process.env.LOCALAPPDATA) {
      directories.push(
        join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
        join(process.env.LOCALAPPDATA, 'Volta', 'bin'),
        join(process.env.LOCALAPPDATA, 'pnpm')
      )
    }
  } else {
    directories.push(
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/home/linuxbrew/.linuxbrew/bin'
    )
  }
  return [
    ...new Set(directories.map((directory) => directory.replace(/^"|"$/g, '')).filter(isAbsolute))
  ]
}

function runDoctor(
  executablePath: string,
  commandArgs: string[],
  timeout: number
): Promise<CliCommandResult> {
  const isBatch = process.platform === 'win32' && executablePath.endsWith('.cmd')
  // cmd.exe expands these characters even inside quotes; never interpolate them.
  if (isBatch && /["%!\r\n]/.test(executablePath)) {
    return Promise.reject(new Error('Unsupported launcher path'))
  }
  const file = isBatch
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')
    : executablePath
  const args = isBatch
    ? ['/d', '/s', '/c', `""${executablePath}" ${commandArgs.join(' ')}"`]
    : commandArgs
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout,
        windowsHide: true,
        windowsVerbatimArguments: isBatch,
        maxBuffer: 512 * 1024,
        cwd: homedir(),
        encoding: 'utf8'
      },
      (error, stdout) => {
        if (error && typeof error.code !== 'number') reject(error)
        else resolve({ stdout, exitCode: typeof error?.code === 'number' ? error.code : 0 })
      }
    )
  })
}

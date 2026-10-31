import { randomUUID } from 'node:crypto'
import { hasControlCharacters } from '@shared/configuration'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, posix, win32 } from 'node:path'
import { net } from 'electron'
import type {
  ApplicationTask,
  ManagedApplication,
  NpmInstallation,
  SetWslLaunchSettingsInput,
  StartApplicationTaskInput,
  WslLaunchSettings
} from '@shared/ipc'
import {
  APPLICATION_DEFINITIONS,
  APPLICATION_IDS,
  APPLICATION_INSTANCES,
  APPLICATION_KINDS,
  getApplicationDefinition,
  isWslApplication,
  type ApplicationId,
  type ApplicationKind
} from '@shared/applications'
import { AppError, toApiError } from '../errors'
import { ApplicationPreferencesStore, DEFAULT_WSL_LAUNCH } from './application-preferences'
import {
  findLocalCommand,
  runLocalApplicationCommand,
  type ApplicationCommandResult
} from './application-command'
import type { ToolInstallationService } from './tool-installation'
import type { PathSettingsStore } from './path-settings'
import type { WslIdentity, WslRuntime } from './wsl-runtime'
import { compareApplicationVersions } from './application-version'

interface ApplicationContext {
  applicationId: ApplicationId
  identity: WslIdentity | null
  launch: WslLaunchSettings
  key: string
}

interface NpmContext {
  info: NpmInstallation
  executablePath: string | null
  packagePath: string | null
}

const unavailableNpm = (message: string): NpmInstallation => ({
  available: false,
  nodeVersion: null,
  npmVersion: null,
  prefix: null,
  packageVersion: null,
  managed: false,
  message
})

/** Fixed application catalog. No renderer-provided executable, package, or shell script is run. */
export class ApplicationManagementService {
  private tasks = new Map<string, ApplicationTask>()
  private locks = new Set<string>()
  private checks = new Map<string, Set<ApplicationId>>()
  private latestQueries = new Map<ApplicationKind, Promise<string>>()

  constructor(
    readonly preferences: ApplicationPreferencesStore,
    private readonly paths: PathSettingsStore,
    private readonly installations: ToolInstallationService,
    private readonly runtime: WslRuntime,
    private readonly changed: (task: ApplicationTask) => void
  ) {}

  getTasks(): ApplicationTask[] {
    return [...this.tasks.values()].map((task) => ({ ...task, log: [...task.log] }))
  }

  hasRunningTasks(): boolean {
    return this.locks.size > 0 || this.checks.size > 0
  }

  async list(detected: (application: ManagedApplication) => void): Promise<ManagedApplication[]> {
    this.paths.refresh()
    this.installations.clear()
    const releases = new Map(
      APPLICATION_KINDS.map((kind) => [
        kind,
        this.readLatest(kind).then(
          (version) => ({ version, error: null }),
          (error: unknown) => ({ version: null, error: toApiError(error).message })
        )
      ])
    )
    return Promise.all(
      APPLICATION_IDS.map(async (applicationId) => {
        const [application, release] = await Promise.all([
          this.inspect(applicationId),
          releases.get(APPLICATION_INSTANCES[applicationId].kind)!
        ])
        const result = withLatestVersion(application, release.version, release.error)
        detected(result)
        return result
      })
    )
  }

  async setLaunch(input: SetWslLaunchSettingsInput): Promise<void> {
    if (!isWslApplication(input.applicationId))
      throw new AppError('INVALID_INPUT', '本机应用不使用 WSL shell 设置。')
    const context = await this.context(input.applicationId)
    if (this.locks.has(context.key) || this.checks.has(context.key)) throw busy()
    // Save even if this shell cannot launch: a user must be able to repair a bad selection.
    this.preferences.setLaunch(context.identity!.distribution, {
      shell: input.shell
    })
    this.paths.refresh()
    this.installations.clear()
  }

  async start(input: StartApplicationTaskInput): Promise<ApplicationTask> {
    const context = await this.context(input.applicationId)
    if (this.locks.has(context.key)) throw busy()
    if (input.action === 'check-update') {
      const checks = this.checks.get(context.key) ?? new Set<ApplicationId>()
      if (checks.has(input.applicationId))
        throw new AppError('CONCURRENT_MODIFICATION', '此工具正在检查更新，请等待完成。')
      checks.add(input.applicationId)
      this.checks.set(context.key, checks)
    } else {
      if (this.checks.has(context.key)) throw busy()
      this.locks.add(context.key)
    }
    const task: ApplicationTask = {
      id: randomUUID(),
      applicationId: input.applicationId,
      action: input.action,
      state: 'running',
      message: '正在检查目标环境…',
      log: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      sidebarVisible: null
    }
    for (const [id, previous] of this.tasks) {
      if (this.tasks.size < 30) break
      if (previous.state !== 'running') this.tasks.delete(id)
    }
    this.tasks.set(task.id, task)
    this.report(
      task,
      `${getApplicationDefinition(input.applicationId).name} · ${context.identity ? `${context.identity.label} / ${context.identity.user}` : '本机'}`
    )
    void this.execute(task, context)
    return { ...task, log: [...task.log] }
  }

  private async context(applicationId: ApplicationId): Promise<ApplicationContext> {
    if (!isWslApplication(applicationId))
      return { applicationId, identity: null, launch: { ...DEFAULT_WSL_LAUNCH }, key: 'local' }
    const configurationToolId = APPLICATION_INSTANCES[applicationId].configurationToolId
    const identity = await this.runtime.readIdentity(
      configurationToolId ? await this.paths.getWslDistribution(configurationToolId) : undefined
    )
    return {
      applicationId,
      identity,
      launch: this.preferences.getLaunch(identity.distribution),
      key: `wsl:${identity.distribution}:${identity.user}`
    }
  }

  private async inspect(
    applicationId: ApplicationId,
    targetContext?: ApplicationContext
  ): Promise<ManagedApplication> {
    const result: ManagedApplication = {
      applicationId,
      installation: {
        state: 'unavailable',
        version: null,
        executablePath: null,
        message: '正在检测…'
      },
      npm: unavailableNpm('尚未检测 npm。'),
      distribution: null,
      distributionLabel: null,
      user: null,
      shell: null,
      launchSettings: { ...DEFAULT_WSL_LAUNCH },
      environmentError: null,
      latestVersion: null,
      latestVersionError: null,
      updateAvailable: false
    }
    try {
      const context = targetContext ?? (await this.context(applicationId))
      if (context.identity) {
        result.distribution = context.identity.distribution
        result.distributionLabel = context.identity.label
        result.user = context.identity.user
        result.launchSettings = context.launch
        result.shell = (await this.runtime.getLaunchInfo(context.identity.distribution)).shell
      }
      const [installation, npm] = await Promise.all([
        this.installations.get(applicationId, true, context.identity?.distribution),
        this.readNpm(context).catch((error): NpmContext => ({
          info: unavailableNpm(toApiError(error).message),
          executablePath: null,
          packagePath: null
        }))
      ])
      result.installation = installation
      if (npm.info.available && installation.executablePath && npm.packagePath) {
        npm.info.managed = await this.ownsExecutable(context, npm, installation.executablePath)
      }
      if (installation.state === 'installed' && !npm.info.managed) {
        npm.info.message = !npm.info.available
          ? npm.info.message
          : npm.info.packageVersion
            ? '当前 CLI 与本环境 npm 安装的副本不同。请先解决重复安装，再执行更新或卸载。'
            : '当前 CLI 由其他方式安装，请通过原安装方式更新或卸载。'
      }
      result.npm = npm.info
    } catch (error) {
      result.environmentError = toApiError(error).message
      result.installation.message = result.environmentError
      result.npm = unavailableNpm(result.environmentError)
    }
    return result
  }

  private readLatest(kind: ApplicationKind): Promise<string> {
    const pending = this.latestQueries.get(kind)
    if (pending) return pending
    const request = (async (): Promise<string> => {
      try {
        const response = await net.fetch(
          `https://registry.npmjs.org/${encodeURIComponent(APPLICATION_DEFINITIONS[kind].npmPackage)}/latest`,
          { cache: 'no-store', signal: AbortSignal.timeout(12_000) }
        )
        if (!response.ok) throw new Error('Registry request failed')
        const manifest: unknown = await response.json()
        const version =
          isRecord(manifest) && manifest.name === APPLICATION_DEFINITIONS[kind].npmPackage
            ? versionValue(manifest.version)
            : null
        if (!version || compareApplicationVersions(version, version) !== 0)
          throw new Error('Invalid registry version')
        return version
      } catch {
        throw new AppError('UNKNOWN', '无法获取 npm 官方最新版本，请检查网络或系统代理后重新检测。')
      }
    })()
    this.latestQueries.set(kind, request)
    void request.then(
      () => this.latestQueries.delete(kind),
      () => this.latestQueries.delete(kind)
    )
    return request
  }

  private async readNpm(context: ApplicationContext): Promise<NpmContext> {
    const versions = await this.command(context, 'npm', ['version', '--json'])
    if (versions.failure)
      return {
        info: unavailableNpm(
          '未找到 npm，请先在此环境安装 Node.js LTS，并确认 npm 已加入所选 shell 的 PATH。'
        ),
        executablePath: null,
        packagePath: null
      }
    if (versions.exitCode !== 0)
      return {
        info: unavailableNpm(commandFailure(versions)),
        executablePath: null,
        packagePath: null
      }
    const versionInfo = jsonObject(versions.stdout)
    const nodeVersion = versionValue(versionInfo.node)
    const npmVersion = versionValue(versionInfo.npm)
    if (!nodeVersion || !npmVersion)
      return {
        info: unavailableNpm(
          '无法读取 Node.js / npm 版本，请检查安装或 shell 启动配置后重新检测。'
        ),
        executablePath: null,
        packagePath: null
      }
    const [prefixResult, packagesResult] = await Promise.all([
      this.command(context, 'npm', ['prefix', '--global'], 20_000, false, versions.executablePath!),
      this.command(
        context,
        'npm',
        [
          'ls',
          '--global',
          '--depth=0',
          '--json',
          '--long',
          getApplicationDefinition(context.applicationId).npmPackage
        ],
        20_000,
        false,
        versions.executablePath!
      )
    ])
    if (prefixResult.exitCode !== 0) throw new AppError('UNKNOWN', commandFailure(prefixResult))
    const prefix = prefixResult.stdout.trim()
    const pathApi = context.identity ? posix : process.platform === 'win32' ? win32 : posix
    if (!pathApi.isAbsolute(prefix) || hasControlCharacters(prefix))
      throw new AppError('INVALID_INPUT', 'npm 全局安装目录无效，请检查 npm prefix 设置。')
    const packages = jsonObject(packagesResult.stdout)
    if (isRecord(packages.error) || ![0, 1].includes(packagesResult.exitCode))
      throw new AppError('UNKNOWN', commandFailure(packagesResult))
    const packageName = getApplicationDefinition(context.applicationId).npmPackage
    const dependency = isRecord(packages.dependencies)
      ? packages.dependencies[packageName]
      : undefined
    const packageVersion = isRecord(dependency) ? versionValue(dependency.version) : null
    const packagePath = packageVersion
      ? pathApi.join(
          prefix,
          ...(!context.identity && process.platform === 'win32' ? [] : ['lib']),
          'node_modules',
          packageName
        )
      : null
    return {
      executablePath: versions.executablePath,
      packagePath,
      info: {
        available: true,
        nodeVersion,
        npmVersion,
        prefix,
        packageVersion,
        managed: false,
        message: '使用此环境的 npm 全局安装。首次安装需要网络连接。'
      }
    }
  }

  private async ownsExecutable(
    context: ApplicationContext,
    npm: NpmContext,
    executable: string
  ): Promise<boolean> {
    if (!npm.packagePath || !npm.info.prefix) return false
    try {
      const pathApi = context.identity ? posix : process.platform === 'win32' ? win32 : posix
      const manifest = jsonObject(
        await readFile(
          this.filePath(context, pathApi.join(npm.packagePath, 'package.json')),
          'utf8'
        )
      )
      const { command } = getApplicationDefinition(context.applicationId)
      const bin =
        typeof manifest.bin === 'string'
          ? manifest.bin
          : isRecord(manifest.bin)
            ? manifest.bin[command]
            : null
      if (typeof bin !== 'string' || hasControlCharacters(bin)) return false
      const target = pathApi.resolve(npm.packagePath, bin)
      if (context.identity) {
        const resolved = await this.command(context, 'readlink', ['-f', executable, target])
        const lines = resolved.stdout.trim().split('\n')
        return resolved.exitCode === 0 && lines.length === 2 && lines[0] === lines[1]
      }
      if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
        if (
          (await realpath(executable)).toLowerCase() !==
          (await realpath(win32.join(npm.info.prefix, `${command}.cmd`))).toLowerCase()
        )
          return false
        const content = (await readFile(executable, 'utf8')).replaceAll('\\', '/').toLowerCase()
        const reference =
          `node_modules/${getApplicationDefinition(context.applicationId).npmPackage}/${bin.replace(/^\.\//u, '')}`.toLowerCase()
        return content.includes(reference)
      }
      return (await realpath(executable)) === (await realpath(target))
    } catch {
      return false
    }
  }

  private async execute(task: ApplicationTask, context: ApplicationContext): Promise<void> {
    let state: 'succeeded' | 'failed' = 'succeeded'
    let latestVersion: string | null = null
    try {
      const definition = getApplicationDefinition(task.applicationId)
      const packageName = definition.npmPackage
      if (task.action === 'check-update') {
        this.report(task, `查询 npm 官方 ${packageName} 的最新版本。`)
        const [version, application] = await Promise.all([
          this.readLatest(APPLICATION_INSTANCES[task.applicationId].kind),
          this.inspect(task.applicationId, context)
        ])
        task.result = withLatestVersion(application, version, null)
        const installation = application.installation
        const comparison = compareApplicationVersions(version, installation.version ?? '')
        task.message =
          comparison === 1
            ? `发现新版本：${installation.version} → ${version}。`
            : comparison === 0
              ? `已是最新版本 ${version}。`
              : comparison === -1
                ? `当前版本 ${installation.version} 高于 npm 最新版 ${version}，无需更新。`
                : `${definition.name} 最新版本：${version}。`
      } else {
        this.report(task, '检查 Node.js、npm 及全局安装目录。')
        const npm = await this.readNpm(context)
        if (!npm.info.available) throw new AppError('PATH_NOT_FOUND', npm.info.message)
        this.report(task, '核对当前 CLI 的安装来源。')
        const installation = await this.installations.get(
          task.applicationId,
          true,
          context.identity?.distribution
        )
        const owned = installation.executablePath
          ? await this.ownsExecutable(context, npm, installation.executablePath)
          : false
        if (task.action === 'install' && installation.state === 'unavailable')
          throw new AppError(
            'INVALID_INPUT',
            '当前 CLI 安装状态无法确认。请先解决启动文件或目录权限问题，再重新检测并安装。'
          )
        if (task.action !== 'install' && !owned)
          throw new AppError(
            'INVALID_INPUT',
            '当前 CLI 不属于此环境的 npm 安装，无法通过 npm 更新或卸载。请使用原安装方式。'
          )
        if (task.action === 'install' && installation.executablePath && !owned)
          throw new AppError(
            'INVALID_INPUT',
            '此环境已有其他来源的 CLI。请先检查现有安装，避免产生重复副本。'
          )
        let targetVersion = 'latest'
        if (task.action === 'update') {
          this.report(task, '重新核对 npm 官方最新版本。')
          targetVersion = await this.readLatest(APPLICATION_INSTANCES[task.applicationId].kind)
          latestVersion = targetVersion
          const comparison = compareApplicationVersions(targetVersion, installation.version ?? '')
          if (comparison === null)
            throw new AppError('UNKNOWN', '无法比较当前 CLI 版本，请重新检测后再更新。')
          if (comparison <= 0) {
            task.message = `当前版本 ${installation.version} 无可用更新，未执行安装。`
            return
          }
        }
        const args =
          task.action === 'uninstall'
            ? [
                'uninstall',
                '--global',
                packageName,
                '--no-audit',
                '--no-fund',
                `--prefix=${npm.info.prefix}`
              ]
            : [
                'install',
                '--global',
                `${packageName}@${targetVersion}`,
                '--engine-strict',
                '--no-audit',
                '--no-fund',
                '--fetch-timeout=20000',
                '--fetch-retries=1',
                `--prefix=${npm.info.prefix}`
              ]
        this.report(task, `npm ${args.join(' ')}`)
        const response = await this.command(
          context,
          'npm',
          args,
          180_000,
          true,
          npm.executablePath!
        )
        if (response.exitCode !== 0) throw new AppError('UNKNOWN', commandFailure(response))
        this.report(task, 'npm 命令已结束，正在核对安装结果。')
        this.installations.clear(task.applicationId)
        task.result = await this.inspect(task.applicationId, context)
        const after = task.result
        if (!after.npm.available)
          throw new AppError(
            'UNKNOWN',
            `npm 命令已结束，但无法确认最终状态。${after.npm.message}请重新检测。`
          )
        if (task.action === 'uninstall') {
          if (after.npm.packageVersion)
            throw new AppError('UNKNOWN', 'npm 包仍然存在，请检查文件占用或安装目录权限后重试。')
          task.message = `${definition.name} 的 npm 安装已卸载，工具配置和历史记录已保留。`
        } else {
          if (
            after.installation.state !== 'installed' ||
            !after.installation.executablePath ||
            !after.npm.managed
          )
            throw new AppError(
              'UNKNOWN',
              'npm 安装已完成，但当前 PATH 中的 CLI 未通过校验。请检查 PATH、重复安装或 shell 环境后重新检测。'
            )
          task.message = `${definition.name} ${task.action === 'install' ? '安装' : '更新'}完成，版本 ${after.installation.version}。请新建工具会话。`
        }
      }
    } catch (error) {
      state = 'failed'
      task.message = toApiError(error).message
    } finally {
      if (task.action === 'check-update') {
        const checks = this.checks.get(context.key)
        checks?.delete(task.applicationId)
        if (!checks?.size) this.checks.delete(context.key)
      } else {
        try {
          if (!task.result) {
            this.installations.clear(task.applicationId)
            task.result = await this.inspect(task.applicationId, context)
          }
          try {
            latestVersion ??= await this.readLatest(APPLICATION_INSTANCES[task.applicationId].kind)
            task.result = withLatestVersion(task.result, latestVersion, null)
          } catch (error) {
            task.result = withLatestVersion(task.result, null, toApiError(error).message)
          }
          const toolId = APPLICATION_INSTANCES[task.applicationId].configurationToolId
          if (state === 'succeeded' && toolId && ['install', 'uninstall'].includes(task.action)) {
            const visible = task.action === 'install'
            this.preferences.setVisible(toolId, visible)
            task.sidebarVisible = visible
          }
        } catch (error) {
          state = 'failed'
          task.message = toApiError(error).message
        } finally {
          this.locks.delete(context.key)
        }
      }
      task.state = state
      task.finishedAt = new Date().toISOString()
      this.report(task, task.message)
    }
  }

  private async command(
    context: ApplicationContext,
    command: string,
    args: string[],
    timeout = 20_000,
    mutation = false,
    executablePath?: string
  ): Promise<ApplicationCommandResult> {
    if (context.identity)
      return this.runtime.runCommand(command, args, context.identity.distribution, {
        timeout,
        launch: context.launch,
        requireTimeout: mutation,
        executablePath
      })
    const executable = executablePath ?? (await findLocalCommand(command))
    if (!executable)
      return {
        stdout: '',
        stderr: '',
        exitCode: 127,
        executablePath: null,
        failure: 'command-not-found'
      }
    return runLocalApplicationCommand(executable, args, timeout)
  }

  private filePath(context: ApplicationContext, path: string): string {
    if (!context.identity) {
      if (!isAbsolute(path)) throw new AppError('INVALID_INPUT', '安装目录必须为绝对路径。')
      return path
    }
    return `\\\\wsl.localhost\\${context.identity.distribution}${path.replaceAll('/', '\\')}`
  }

  private report(task: ApplicationTask, message: string): void {
    if (task.state === 'running') task.message = message
    task.log = [...task.log.slice(-39), message]
    // Only our own progress messages leave the main process. Raw npm output may contain tokens.
    this.changed({ ...task, log: [...task.log] })
  }
}

function withLatestVersion(
  application: ManagedApplication,
  version: string | null,
  error: string | null
): ManagedApplication {
  return {
    ...application,
    latestVersion: version,
    latestVersionError: error,
    updateAvailable:
      application.installation.state === 'installed' &&
      version !== null &&
      compareApplicationVersions(version, application.installation.version ?? '') === 1
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonObject(content: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    /* Never include raw command output in errors. */
  }
  if (!isRecord(value))
    throw new AppError(
      'UNKNOWN',
      '命令返回的 JSON 无法读取，请检查 npm 和 shell 启动配置后重新检测。'
    )
  return value
}

function versionValue(value: unknown): string | null {
  return typeof value === 'string' && compareApplicationVersions(value, value) === 0
    ? value.replace(/^v/u, '')
    : null
}

function busy(): AppError {
  return new AppError('CONCURRENT_MODIFICATION', '此环境已有应用管理任务，请等待完成后再操作。')
}

function commandFailure(result: ApplicationCommandResult): string {
  const output = `${result.stdout}\n${result.stderr}`
  if (result.exitCode === 124 || result.exitCode === 137)
    return '命令执行超时，已停止本次任务。请检查网络和 shell 配置后重新检测。'
  if (result.exitCode === 125)
    return 'WSL 缺少 timeout 命令，无法限制安装任务时长。请先安装 coreutils 后重试。'
  if (/\b(EACCES|EPERM)\b/u.test(output))
    return '没有权限修改 npm 安装目录，或文件正在使用。请关闭相关 CLI 并检查目录权限；推荐使用用户级 Node.js 安装。'
  if (/\bEBADENGINE\b/u.test(output))
    return '当前 Node.js 版本不满足此应用的要求。请升级该环境的 Node.js LTS 后重试。'
  if (
    /\b(ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH)\b/u.test(
      output
    )
  )
    return '无法连接 npm registry。请检查该环境的网络、代理和 npm registry 设置后重试。'
  if (/\b(ENOSPC|EDQUOT)\b/u.test(output))
    return '磁盘空间或用户配额不足，请清理 npm 安装目录所在磁盘后重试。'
  if (/\b(E401|E403)\b/u.test(output))
    return 'npm registry 拒绝访问，请检查 registry 地址和认证设置后重试。'
  if (/\bETARGET\b/u.test(output))
    return '当前 npm registry 未提供所需版本，请检查镜像是否已同步 npm 官方版本后重试。'
  return `命令执行失败（退出码 ${result.exitCode}）。请在对应环境检查 npm 安装、文件占用和 registry 设置后重新检测。`
}

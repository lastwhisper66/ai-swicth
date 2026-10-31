import { execFile } from 'node:child_process'
import { hasControlCharacters } from '@shared/configuration'
import type { WslLaunchSettings } from '@shared/ipc'
import { AppError } from '../errors'
import { DEFAULT_WSL_LAUNCH } from './application-preferences'

interface WslProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface WslIdentity {
  distribution: string
  label: string
  home: string
  user: string
  defaultShell: string
}

export interface WslUserEnvironment {
  distribution: string
  home: string
  shell: string
  variables: Record<string, string>
}

export interface WslLaunchInfo extends WslIdentity {
  shell: string
  settings: WslLaunchSettings
}

export interface WslCommandResult extends WslProcessResult {
  executablePath: string | null
  failure: 'command-not-found' | null
}

const IDENTITY_MARKER = '__AI_SWITCH_WSL_IDENTITY__'
const ENVIRONMENT_MARKER = '__AI_SWITCH_WSL_ENV__'
const COMMAND_MARKER = '__AI_SWITCH_WSL_COMMAND__'

/** User identity discovery does not depend on a working login configuration. */
export class WslRuntime {
  private identities = new Map<string, Promise<WslIdentity>>()

  constructor(
    private readonly getSettings: (distribution: string) => WslLaunchSettings = () => ({
      ...DEFAULT_WSL_LAUNCH
    })
  ) {}

  refresh(): void {
    this.identities.clear()
  }

  async readIdentity(distribution?: string): Promise<WslIdentity> {
    const key = distribution ?? ''
    const cached = this.identities.get(key)
    if (cached) return cached
    const pending = this.discoverIdentity(distribution)
    this.identities.set(key, pending)
    void pending.catch(() => this.identities.delete(key))
    return pending
  }

  async getLaunchInfo(distribution?: string, override?: WslLaunchSettings): Promise<WslLaunchInfo> {
    const identity = await this.readIdentity(distribution)
    const settings = override ?? this.getSettings(identity.distribution)
    let shell = identity.defaultShell
    if (settings.shell !== 'auto') {
      const result = await this.execute(
        `location=$(command -v "$1") || exit 1
case "$location" in /mnt/*|*.exe|*.cmd|*.bat) exit 1;; /*) ;; *) exit 1;; esac
[ -x "$location" ] || exit 1
printf '%s' "$location"`,
        [settings.shell],
        identity.distribution,
        15_000,
        true
      )
      if (result.exitCode !== 0)
        throw new AppError(
          'WSL_UNAVAILABLE',
          `此发行版未找到可用的 ${settings.shell}。请先安装该 shell，或选择“自动”后重试。`
        )
      shell = result.stdout.trim()
    }
    if (!shell.startsWith('/') || hasControlCharacters(shell)) {
      throw new AppError('WSL_UNAVAILABLE', '无法确定 WSL shell，请重新选择 shell 后重试。')
    }
    return { ...identity, shell, settings: { ...settings } }
  }

  async readEnvironment(
    variableNames: string[],
    distribution?: string
  ): Promise<WslUserEnvironment> {
    if (variableNames.some((name) => !/^[A-Z_][A-Z0-9_]*$/u.test(name)))
      throw new AppError('INVALID_INPUT', 'WSL 环境变量名称无效。')
    const launch = await this.getLaunchInfo(distribution)
    const fields = ['HOME', ...variableNames]
    const script = `printf '${ENVIRONMENT_MARKER}\\0'; printf '%s\\0' ${fields.map((name) => `"$${name}"`).join(' ')}`
    const { stdout } = await this.runScript(script, [], launch)
    const values = stdout.split(`${ENVIRONMENT_MARKER}\0`)[1]?.split('\0')
    if (
      !values ||
      values.length < fields.length + 1 ||
      !values[0].startsWith('/') ||
      values.some(hasControlCharacters)
    )
      throw new AppError('WSL_UNAVAILABLE', 'WSL 用户环境返回了无效内容，请检查 shell 启动配置。')
    return {
      distribution: launch.distribution,
      home: values[0],
      shell: launch.shell,
      variables: Object.fromEntries(variableNames.map((name, index) => [name, values[index + 1]]))
    }
  }

  async runCommand(
    command: string,
    args: string[],
    distribution: string,
    options: {
      timeout?: number
      launch?: WslLaunchSettings
      requireTimeout?: boolean
      executablePath?: string
    } = {}
  ): Promise<WslCommandResult> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/u.test(command))
      throw new AppError('INVALID_INPUT', 'WSL 命令名称无效。')
    const launch = await this.getLaunchInfo(distribution, options.launch)
    if (
      options.executablePath &&
      (!options.executablePath.startsWith('/') ||
        options.executablePath.startsWith('/mnt/') ||
        hasControlCharacters(options.executablePath))
    )
      throw new AppError('INVALID_INPUT', 'WSL 可执行文件路径无效。')
    const result = await this.runScript(
      `command_name=$1
shift
fixed_location=$1
shift
set -f
previous_ifs=$IFS
IFS=:
location=
for directory in $PATH; do
  case "$directory" in /mnt/[a-z]/*) continue;; /*) ;; *) continue;; esac
  candidate="$directory/$command_name"
  case "$candidate" in *.exe|*.cmd|*.bat) continue;; esac
  if [ -f "$candidate" ] && [ -x "$candidate" ]; then location=$candidate; break; fi
done
IFS=$previous_ifs
if [ -n "$fixed_location" ]; then
  location=$fixed_location
  [ -f "$location" ] && [ -x "$location" ] || location=
fi
if [ -z "$location" ]; then
  printf '${COMMAND_MARKER}\\0missing\\0'
  exit 127
fi
printf '${COMMAND_MARKER}\\0found\\0%s\\0' "$location"
exec "$location" "$@"`,
      [command, options.executablePath ?? '', ...args],
      launch,
      options.timeout ?? 15_000,
      true,
      options.requireTimeout
    )
    const markerIndex = result.stdout.indexOf(`${COMMAND_MARKER}\0`)
    if (result.exitCode === 124 || result.exitCode === 137)
      throw new AppError(
        'WSL_UNAVAILABLE',
        'WSL 命令执行超时，已停止本次任务。请检查网络和 shell 启动配置后重新检测。'
      )
    if (result.exitCode === 125 && options.requireTimeout)
      throw new AppError(
        'WSL_UNAVAILABLE',
        'WSL 缺少 timeout 命令，无法限制任务时长。请先安装 coreutils 后重试。'
      )
    if (markerIndex < 0) throw new AppError('WSL_UNAVAILABLE', 'WSL 命令未能启动，请检查 shell。')
    const framed = result.stdout.slice(markerIndex + COMMAND_MARKER.length + 1)
    if (framed.startsWith('missing\0'))
      return { ...result, stdout: '', executablePath: null, failure: 'command-not-found' }
    const pathEnd = framed.indexOf('\0', 'found\0'.length)
    if (!framed.startsWith('found\0') || pathEnd < 0)
      throw new AppError('WSL_UNAVAILABLE', 'WSL 命令返回了无效内容，请检查 shell 启动配置。')
    return {
      ...result,
      stdout: framed.slice(pathEnd + 1),
      executablePath: framed.slice('found\0'.length, pathEnd),
      failure: null
    }
  }

  private async discoverIdentity(distribution?: string): Promise<WslIdentity> {
    const result = await this.execute(
      `user_id=$(id -u) || exit 1
user_name=$(id -un) || exit 1
record=$(getent passwd "$user_id" 2>/dev/null) || record=$(awk -F: -v uid="$user_id" '$3 == uid { print; exit }' /etc/passwd)
login_shell=$(printf '%s\\n' "$record" | awk -F: '{ print $7 }')
[ -n "$login_shell" ] || login_shell=\${SHELL:-/bin/sh}
label=$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release 2>/dev/null | head -n 1)
printf '${IDENTITY_MARKER}\\0%s\\0%s\\0%s\\0%s\\0%s\\0' "$WSL_DISTRO_NAME" "$HOME" "$user_name" "$login_shell" "$label"`,
      [],
      distribution
    )
    const fields = result.stdout.split(`${IDENTITY_MARKER}\0`)[1]?.split('\0')
    if (!fields || fields.length < 6 || fields.some(hasControlCharacters))
      throw new AppError('WSL_UNAVAILABLE', '无法读取 WSL 用户信息，请确认发行版可启动。')
    const [name, home, user, defaultShell, label] = fields
    if (
      !name ||
      /[\\/]/u.test(name) ||
      !home.startsWith('/') ||
      !defaultShell.startsWith('/') ||
      !user
    )
      throw new AppError('WSL_UNAVAILABLE', 'WSL 用户信息无效，请检查默认用户和登录 shell。')
    return {
      distribution: name,
      home,
      user,
      defaultShell,
      label: label.replace(/^['"]|['"]$/g, '') || name
    }
  }

  private runScript(
    script: string,
    args: string[],
    launch: WslLaunchInfo,
    timeout = 15_000,
    acceptNonZero = false,
    requireTimeout = false
  ): Promise<WslProcessResult> {
    const shellCommand = [
      'exec /bin/sh -c',
      quoteShellArgument(script),
      '--',
      ...args.map(quoteShellArgument)
    ].join(' ')
    return this.execute(
      requireTimeout
        ? `cd "$1" || exit 1; shift; timeout_path=$(command -v timeout) || exit 125; exec "$timeout_path" --signal=TERM --kill-after=5s ${Math.ceil(timeout / 1000)}s "$@"`
        : 'cd "$1" || exit 1; shift; exec "$@"',
      [launch.home, launch.shell, '-lic', shellCommand],
      launch.distribution,
      timeout + 7000,
      acceptNonZero
    )
  }

  private execute(
    script: string,
    args: string[],
    distribution?: string,
    timeout = 15_000,
    acceptNonZero = false
  ): Promise<WslProcessResult> {
    if (process.platform !== 'win32')
      throw new AppError('WSL_UNAVAILABLE', 'WSL 应用管理仅支持 Windows。')
    return new Promise((resolve, reject) => {
      execFile(
        'wsl.exe',
        [
          ...(distribution ? ['--distribution', distribution] : []),
          '--exec',
          '/bin/sh',
          '-c',
          script,
          '--',
          ...args
        ],
        { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error && (!acceptNonZero || typeof error.code !== 'number')) {
            reject(
              new AppError(
                'WSL_UNAVAILABLE',
                error.killed
                  ? 'WSL 命令超时，请检查 shell 启动配置是否等待输入，并重试。'
                  : '无法在 WSL 中执行命令，请检查发行版、用户权限及所选 shell。'
              )
            )
          } else
            resolve({
              stdout: stdout.replaceAll('\r\n', '\n'),
              stderr,
              exitCode: typeof error?.code === 'number' ? error.code : 0
            })
        }
      )
    })
  }
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

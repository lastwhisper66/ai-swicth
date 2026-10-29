import { execFile } from 'node:child_process'
import { hasControlCharacters } from '@shared/configuration'
import { AppError } from '../errors'

interface WslProcessResult {
  stdout: string
  exitCode: number
}

export interface WslUserEnvironment {
  distribution: string
  home: string
  shell: string
  variables: Record<string, string>
}

export interface WslCommandResult extends WslProcessResult {
  executablePath: string | null
  failure: 'command-not-found' | null
}

const ENVIRONMENT_MARKER = '__AI_SWITCH_WSL_ENV__'
const COMMAND_MARKER = '__AI_SWITCH_WSL_COMMAND__'

/** Transport and environment discovery only; independent of tools and package managers. */
export class WslRuntime {
  async readEnvironment(
    variableNames: string[],
    distribution?: string
  ): Promise<WslUserEnvironment> {
    if (variableNames.some((name) => !/^[A-Z_][A-Z0-9_]*$/u.test(name)))
      throw new AppError('INVALID_INPUT', 'WSL 环境变量名称无效。')
    const fields = ['WSL_DISTRO_NAME', 'HOME', 'SHELL', ...variableNames]
    const script = `printf '${ENVIRONMENT_MARKER}\\0'; printf '%s\\0' ${fields.map((name) => `"$${name}"`).join(' ')}`
    try {
      const { stdout } = await this.runScript(script, [], distribution)
      const framed = stdout.split(`${ENVIRONMENT_MARKER}\0`)[1]?.split('\0')
      if (!framed || framed.length < fields.length + 1) throw new Error('Invalid WSL environment')
      const values = framed.slice(0, fields.length)
      const [name, home, shell] = values
      if (
        !name ||
        /[\\/]/u.test(name) ||
        hasControlCharacters(name) ||
        !home.startsWith('/') ||
        values.some(hasControlCharacters)
      )
        throw new Error('Invalid WSL environment')
      return {
        distribution: name,
        home,
        shell,
        variables: Object.fromEntries(variableNames.map((key, index) => [key, values[index + 3]]))
      }
    } catch {
      throw new AppError(
        'WSL_UNAVAILABLE',
        distribution
          ? `无法读取 WSL 发行版 ${distribution} 的用户环境。请确认发行版及默认 shell 可启动、当前用户有权限后刷新。`
          : '无法读取默认 WSL 发行版的用户环境。请确认 WSL 已安装、发行版及默认 shell 可启动后刷新；可用 wsl --set-default <发行版> 更改默认发行版。'
      )
    }
  }

  async runCommand(
    command: string,
    args: string[],
    distribution: string
  ): Promise<WslCommandResult> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/u.test(command))
      throw new AppError('INVALID_INPUT', 'WSL 命令名称无效。')
    // Resolve real executables through the initialized PATH, including package-manager shims.
    // Skip inherited Windows launchers so they cannot masquerade as a Linux installation.
    const result = await this.runScript(
      `command_name=$1
shift
set -f
previous_ifs=$IFS
IFS=:
location=
for directory in $PATH; do
  case "$directory" in /*) ;; *) continue;; esac
  candidate="$directory/$command_name"
  case "$candidate" in *.exe|*.cmd|*.bat|/mnt/[a-z]/*) continue;; esac
  if [ -f "$candidate" ] && [ -x "$candidate" ]; then
    location=$candidate
    break
  fi
done
IFS=$previous_ifs
if [ -z "$location" ]; then
  printf '${COMMAND_MARKER}\\0missing\\0'
  exit 127
fi
printf '${COMMAND_MARKER}\\0found\\0%s\\0' "$location"
exec "$location" "$@"`,
      [command, ...args],
      distribution,
      true
    )
    const markerIndex = result.stdout.indexOf(`${COMMAND_MARKER}\0`)
    if (markerIndex < 0) throw new Error('WSL command did not start')
    const framed = result.stdout.slice(markerIndex + COMMAND_MARKER.length + 1)
    if (framed.startsWith('missing\0')) {
      return {
        stdout: '',
        exitCode: result.exitCode,
        executablePath: null,
        failure: 'command-not-found'
      }
    }
    if (!framed.startsWith('found\0')) throw new Error('Invalid WSL command result')
    const pathEnd = framed.indexOf('\0', 'found\0'.length)
    if (pathEnd < 0) throw new Error('Invalid WSL command path')
    return {
      stdout: framed.slice(pathEnd + 1),
      exitCode: result.exitCode,
      executablePath: framed.slice('found\0'.length, pathEnd),
      failure: null
    }
  }

  private runScript(
    script: string,
    args: string[],
    distribution?: string,
    acceptNonZero = false
  ): Promise<WslProcessResult> {
    if (process.platform !== 'win32') {
      throw new AppError('WSL_UNAVAILABLE', 'WSL 配置管理仅支持 Windows。')
    }
    // The user's shell initializes PATH for any installation method. The inner POSIX shell
    // handles our fixed scripts consistently even when the user's shell uses different syntax.
    const shellCommand = [
      'exec /bin/sh -c',
      quoteShellArgument(script),
      '--',
      ...args.map(quoteShellArgument)
    ].join(' ')
    const wslArgs = [
      ...(distribution ? ['--distribution', distribution] : []),
      '--exec',
      '/bin/sh',
      '-c',
      `cd "$HOME" || exit 1; exec "\${SHELL:-/bin/sh}" -lic ${quoteShellArgument(shellCommand)}`
    ]
    return new Promise((resolve, reject) => {
      execFile(
        'wsl.exe',
        wslArgs,
        { windowsHide: true, timeout: 15_000, maxBuffer: 512 * 1024, encoding: 'utf8' },
        (error, stdout) => {
          if (error && (!acceptNonZero || typeof error.code !== 'number')) reject(error)
          else
            resolve({
              stdout: stdout.replaceAll('\r\n', '\n'),
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

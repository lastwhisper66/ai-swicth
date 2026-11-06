import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createMessageConnection,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection
} from 'vscode-jsonrpc/node'
import { AppError } from '../errors'
import { findLocalCommand } from '../services/application-command'
import { getCodexCommandDirectories } from '../services/codex-cli-location'
import { access } from 'node:fs/promises'
import type { WslRuntime } from '../services/wsl-runtime'
import { parseWslPath } from '../services/wsl'

interface NativeLocation {
  directory: string
  distribution?: string
}

export class SessionRpcError extends AppError {
  constructor(readonly rpcCode: number) {
    super(
      'UNKNOWN',
      rpcCode === -32601
        ? '当前 CLI 版本尚不支持此会话操作，请更新原工具后重试。'
        : '原工具拒绝了会话操作，请先关闭正在使用该会话的窗口，再刷新重试。'
    )
  }
}

/** A short-lived, local-only client. Never starts/resumes a turn or sends a prompt. */
export class NativeSessionRpc {
  private connection?: MessageConnection
  private sequence = 0
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private stopped = false
  private buffer = ''

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly kind: 'codex' | 'copilot'
  ) {
    child.stderr.resume()
    if (kind === 'copilot') {
      this.connection = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin)
      )
      this.connection.onRequest(() => {
        throw new Error('会话浏览不接受工具执行或权限请求。')
      })
      this.connection.listen()
    } else {
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        this.buffer += chunk
        if (this.buffer.length > 128 * 1024 * 1024) {
          this.close()
          return
        }
        let end: number
        while ((end = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, end)
          this.buffer = this.buffer.slice(end + 1)
          try {
            const message = JSON.parse(line)
            const handler = this.pending.get(message.id)
            if (!handler) continue
            this.pending.delete(message.id)
            if (message.error) handler.reject(new SessionRpcError(message.error.code))
            else handler.resolve(message.result)
          } catch {
            // A CLI startup notice is not a JSON-RPC response.
          }
        }
      })
    }
    child.stdin.on('error', () => this.close())
    child.on('error', () => this.close())
    child.on('close', () => this.close())
  }

  static async open(
    kind: 'codex' | 'copilot',
    location: NativeLocation,
    wsl: WslRuntime
  ): Promise<NativeSessionRpc> {
    const command = kind === 'codex' ? 'codex' : 'copilot'
    const args = kind === 'codex' ? ['app-server'] : ['--headless', '--no-auto-update', '--stdio']
    const variable = kind === 'codex' ? 'CODEX_HOME' : 'COPILOT_HOME'
    let child: ChildProcessWithoutNullStreams
    if (location.distribution) {
      const launch = await wsl.getLaunchInfo(location.distribution)
      const root = parseWslPath(location.directory)
        .directory.replace(/^\\\\(?:wsl\.localhost|wsl\$)\\[^\\]+/iu, '')
        .replaceAll('\\', '/')
      const quote = (value: string): string => `'${value.replaceAll("'", "'\"'\"'")}'`
      const script = [
        'location=$(command -v "$1") || exit 127',
        'shift',
        'case "$location" in /mnt/*|*.exe|*.cmd|*.bat) exit 127;; /*) ;; *) exit 127;; esac',
        'environment=$1; shift; exec env "$environment" "$location" "$@"'
      ]
      const inner = [
        'exec /bin/sh -c',
        quote(script.join('\n')),
        '--',
        quote(command),
        quote(`${variable}=${root}`),
        ...args.map(quote)
      ].join(' ')
      child = spawn(
        'wsl.exe',
        ['--distribution', launch.distribution, '--exec', launch.shell, '-lic', inner],
        { windowsHide: true, stdio: 'pipe' }
      )
    } else {
      let executable = await findLocalCommand(command)
      if (!executable && kind === 'codex') {
        for (const directory of getCodexCommandDirectories()) {
          const candidate = join(directory, 'codex.exe')
          if (
            await access(candidate).then(
              () => true,
              () => false
            )
          ) {
            executable = candidate
            break
          }
        }
      }
      if (!executable)
        throw new AppError(
          'PATH_NOT_FOUND',
          `未找到 ${command} CLI。请安装或更新原工具后重试会话操作。`
        )
      const batch = process.platform === 'win32' && executable.endsWith('.cmd')
      if (batch && /["%!\r\n]/u.test(executable))
        throw new AppError('INVALID_INPUT', 'CLI 路径含不支持的字符，请调整安装目录。')
      child = spawn(
        batch ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe') : executable,
        batch
          ? ['/d', '/s', '/c', `""${executable}" ${args.map((arg) => `"${arg}"`).join(' ')}"`]
          : args,
        {
          env: { ...process.env, [variable]: location.directory },
          cwd: homedir(),
          windowsHide: true,
          windowsVerbatimArguments: batch,
          stdio: 'pipe'
        }
      )
    }
    const client = new NativeSessionRpc(child, kind)
    try {
      if (kind === 'codex') {
        await client.request('initialize', {
          clientInfo: { name: 'ai_switch_sessions', version: '1.0.0' },
          capabilities: { experimentalApi: true }
        })
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n')
      } else {
        await client.request('ping', { message: 'ai-switch' })
      }
      return client
    } catch (error) {
      client.close()
      throw error
    }
  }

  async request(method: string, params: unknown): Promise<unknown> {
    if (this.stopped) throw new AppError('UNKNOWN', '会话服务已退出，请检查 CLI 安装后重试。')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.kind === 'copilot'
          ? this.connection!.sendRequest(method, params)
          : new Promise<unknown>((resolve, reject) => {
              const id = ++this.sequence
              this.pending.set(id, { resolve, reject })
              this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
            }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.close()
            reject(new AppError('UNKNOWN', '读取会话超时，请检查 CLI 或 WSL 后重新刷新。'))
          }, 30_000)
        })
      ])
    } catch (error) {
      if (error instanceof ResponseError) throw new SessionRpcError(error.code)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  get closed(): boolean {
    return this.stopped
  }

  close(): void {
    if (this.stopped) return
    this.stopped = true
    this.connection?.dispose()
    for (const handler of this.pending.values())
      handler.reject(new AppError('UNKNOWN', '会话服务已退出，请检查 CLI 后重试。'))
    this.pending.clear()
    this.child.stdin.end()
    if (!this.child.killed && this.child.exitCode === null) {
      if (process.platform === 'win32' && this.child.pid) {
        execFile(
          join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/pid', String(this.child.pid), '/t', '/f'],
          { windowsHide: true },
          () => this.child.kill()
        )
      } else this.child.kill()
    }
  }
}

import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../errors'
import { getSearchDirectories } from './tool-installation'

export interface ApplicationCommandResult {
  stdout: string
  stderr: string
  exitCode: number
  executablePath: string | null
  failure: 'command-not-found' | null
}

export async function findLocalCommand(command: string): Promise<string | null> {
  const names = process.platform === 'win32' ? [`${command}.exe`, `${command}.cmd`] : [command]
  for (const directory of getSearchDirectories()) {
    for (const name of names) {
      const path = join(directory, name)
      try {
        if (!(await stat(path)).isFile()) continue
        await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
        return path
      } catch {
        /* Continue through PATH; never execute aliases or functions. */
      }
    }
  }
  return null
}

/** Only fixed, argument-separated commands from the main process reach this runner. */
export function runLocalApplicationCommand(
  executablePath: string,
  args: string[],
  timeout = 20_000
): Promise<ApplicationCommandResult> {
  const batch = process.platform === 'win32' && executablePath.toLowerCase().endsWith('.cmd')
  if (batch && (/["%!\r\n]/u.test(executablePath) || args.some((arg) => /["%!\r\n]/u.test(arg))))
    throw new AppError(
      'INVALID_INPUT',
      'npm 启动路径含不支持的字符，请调整 Node.js 安装路径后重试。'
    )
  const file = batch
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')
    : executablePath
  const commandArgs = batch
    ? ['/d', '/s', '/c', `""${executablePath}" ${args.map((arg) => `"${arg}"`).join(' ')}"`]
    : args
  return new Promise((resolve, reject) => {
    let timedOut = false
    let outputExceeded = false
    let stdout = ''
    let stderr = ''
    let outputSize = 0
    const child = spawn(file, commandArgs, {
      windowsHide: true,
      windowsVerbatimArguments: batch,
      cwd: homedir(),
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    function stop(): void {
      if (process.platform === 'win32' && child.pid) {
        execFile(
          join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/pid', String(child.pid), '/t', '/f'],
          { windowsHide: true },
          () => child.kill()
        )
      } else if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      }
    }
    function receive(chunk: string, error: boolean): void {
      outputSize += Buffer.byteLength(chunk)
      if (outputSize > 2 * 1024 * 1024) {
        if (!outputExceeded) {
          outputExceeded = true
          stop()
        }
        return
      }
      if (error) stderr += chunk
      else stdout += chunk
    }
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => receive(chunk, false))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => receive(chunk, true))
    child.on('error', () => {
      clearTimeout(timer)
      reject(new AppError('UNKNOWN', '命令无法启动，请检查 Node.js、npm 和安装目录权限后重试。'))
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      if (timedOut)
        reject(
          new AppError(
            'UNKNOWN',
            '命令执行超时，已停止本次任务。请检查网络或文件占用情况后重新检测。'
          )
        )
      else if (outputExceeded)
        reject(
          new AppError(
            'UNKNOWN',
            '命令输出超过限制，已停止任务。请检查 npm 和 shell 配置后重新检测。'
          )
        )
      else if (exitCode === null)
        reject(new AppError('UNKNOWN', '命令被中断，请重新检测安装状态。'))
      else resolve({ stdout, stderr, exitCode, executablePath, failure: null })
    })
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeout)
  })
}

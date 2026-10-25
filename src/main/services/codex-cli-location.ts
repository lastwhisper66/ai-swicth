import { execFile } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)

export function getCodexCommandDirectories(): string[] {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return []
  return [join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin')]
}

export async function findBundledCodexCli(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  const powershell = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const { stdout } = await executeFile(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; ConvertTo-Json -Compress -InputObject @(Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -ExpandProperty InstallLocation)"
    ],
    { timeout: 4_000, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 }
  )
  const locations: unknown = JSON.parse(stdout.replace(/^\uFEFF/, '').trim())
  if (
    !Array.isArray(locations) ||
    !locations.every((location) => typeof location === 'string' && isAbsolute(location))
  ) {
    throw new Error('Invalid Codex package locations')
  }

  // Read the bundled CLI version from its executable, independently of the app's version.
  return locations.map((location) => join(location, 'app', 'resources', 'codex.exe'))
}

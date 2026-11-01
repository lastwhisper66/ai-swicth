import { stripVTControlCharacters } from 'node:util'
import { baseToolId, type ToolId } from '@shared/ipc'
import { isObject } from '@shared/configuration'
import { getApplicationDefinition, type ApplicationId } from '@shared/applications'

export interface CliCommandResult {
  stdout: string
  exitCode: number
}

export interface ToolDiagnosis {
  version: string
}

export type DoctorInstallMethod =
  'native' | 'npm-global' | 'npm-local' | 'homebrew' | 'winget' | 'scoop' | 'pnpm' | 'bun'

/** Only known installation tokens leave the main process, never the complete doctor report. */
export function parseDoctorInstallMethod(
  toolId: ToolId,
  output: string
): DoctorInstallMethod | null {
  const content = stripVTControlCharacters(output).trim()
  const normalize = (value: unknown): DoctorInstallMethod | null => {
    if (typeof value !== 'string') return null
    switch (value.trim().toLowerCase()) {
      case 'native':
      case 'standalone':
        return 'native'
      case 'npm':
      case 'npm-global':
      case 'global':
        return 'npm-global'
      case 'npm-local':
      case 'local':
        return 'npm-local'
      case 'brew':
      case 'homebrew':
        return 'homebrew'
      case 'winget':
        return 'winget'
      case 'scoop':
        return 'scoop'
      case 'pnpm':
        return 'pnpm'
      case 'bun':
        return 'bun'
      default:
        return null
    }
  }
  if (baseToolId(toolId) === 'claude-code') {
    const running = content.match(/^\s*(?:Currently running|Running):\s*([\w-]+)/imu)?.[1]
    return normalize(running)
  }
  try {
    const report: unknown = JSON.parse(content)
    if (!isObject(report) || !isObject(report.checks) || !isObject(report.checks.installation))
      return null
    const installation = report.checks.installation
    if (isObject(installation.details)) {
      const details = installation.details
      for (const [key, method] of [
        ['managed by pnpm', 'pnpm'],
        ['managed by bun', 'bun'],
        ['managed by npm', 'npm-global']
      ] as const) {
        if (details[key] === true || details[key] === 'true') return method
      }
      if (
        typeof details['install context'] === 'string' &&
        /^standalone(?:\s|\(|$)/iu.test(details['install context'])
      )
        return 'native'
    }
    for (const record of [installation, installation.details]) {
      if (!isObject(record)) continue
      for (const key of [
        'installMethod',
        'install_method',
        'installationMethod',
        'packageManager'
      ]) {
        const method = normalize(record[key])
        if (method) return method
      }
    }
  } catch {
    /* Older CLI versions may not support JSON diagnostics. */
  }
  return null
}

export function parseToolVersion(
  applicationId: ApplicationId,
  output: string
): ToolDiagnosis | null {
  const content = stripVTControlCharacters(output).trim()
  const pattern = getApplicationDefinition(applicationId).versionPattern
  const version = pattern.exec(content)?.[1]
  return version ? { version } : null
}

export function doctorArguments(toolId: ToolId): string[] {
  return baseToolId(toolId) === 'codex' ? ['doctor', '--json'] : ['doctor']
}

/** Read installation metadata only; other doctor checks do not affect installation status. */
export function parseToolDoctor(toolId: ToolId, output: string): ToolDiagnosis | null {
  const content = stripVTControlCharacters(output).trim()
  if (baseToolId(toolId) === 'codex') {
    try {
      const report: unknown = JSON.parse(content)
      if (
        !isObject(report) ||
        typeof report.codexVersion !== 'string' ||
        !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(report.codexVersion) ||
        !isObject(report.checks) ||
        !isObject(report.checks.installation)
      )
        return null
      return { version: report.codexVersion }
    } catch {
      return null
    }
  }

  const version = content.match(
    /\b(?:Currently running|Running):[^\r\n]*?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/iu
  )?.[1]
  if (!version || !/\b(?:Config install method|Path):/iu.test(content)) return null
  return { version }
}

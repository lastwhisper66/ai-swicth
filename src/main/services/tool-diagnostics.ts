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

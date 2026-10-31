import type { ToolId } from './ipc'

/** Add CLI metadata here; provider configuration adapters remain independent. */
export const APPLICATION_DEFINITIONS = {
  'claude-code': {
    name: 'Claude Code',
    npmPackage: '@anthropic-ai/claude-code',
    command: 'claude',
    icon: 'claude-code',
    versionArgs: ['--version'],
    versionPattern: /^(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)\s+\(Claude Code\)/imu
  },
  codex: {
    name: 'Codex CLI',
    npmPackage: '@openai/codex',
    command: 'codex',
    icon: 'codex',
    versionArgs: ['--version'],
    versionPattern: /^codex(?:-cli)?\s+(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)(?:\s|$)/imu
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    npmPackage: '@google/gemini-cli',
    command: 'gemini',
    icon: 'gemini-cli',
    versionArgs: ['--version'],
    versionPattern:
      /^(?:gemini(?:-cli)?(?:\s+version)?[:\s]+)?v?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)(?:\s|$)/imu
  },
  'grok-build': {
    name: 'Grok Build',
    npmPackage: '@xai-official/grok',
    command: 'grok',
    icon: 'grok-build',
    versionArgs: ['--version'],
    versionPattern:
      /^(?:grok(?:\s+build)?(?:\s+version)?[:\s]+)?v?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)(?:\s|$)/imu
  }
} as const

export type ApplicationKind = keyof typeof APPLICATION_DEFINITIONS
export type ApplicationIconId = (typeof APPLICATION_DEFINITIONS)[ApplicationKind]['icon']

interface ApplicationInstance {
  kind: ApplicationKind
  environment: 'local' | 'wsl'
  configurationToolId: ToolId | null
}

/** Instances describe where a CLI is managed and whether it has a provider page. */
export const APPLICATION_INSTANCES = {
  'claude-code': { kind: 'claude-code', environment: 'local', configurationToolId: 'claude-code' },
  codex: { kind: 'codex', environment: 'local', configurationToolId: 'codex' },
  'claude-code-wsl': {
    kind: 'claude-code',
    environment: 'wsl',
    configurationToolId: 'claude-code-wsl'
  },
  'codex-wsl': { kind: 'codex', environment: 'wsl', configurationToolId: 'codex-wsl' },
  'gemini-cli': { kind: 'gemini-cli', environment: 'local', configurationToolId: null },
  'grok-build': { kind: 'grok-build', environment: 'local', configurationToolId: null }
} as const satisfies Record<string, ApplicationInstance>

export type ApplicationId = keyof typeof APPLICATION_INSTANCES
export const APPLICATION_IDS = Object.keys(APPLICATION_INSTANCES) as ApplicationId[]
export const APPLICATION_KINDS = Object.keys(APPLICATION_DEFINITIONS) as ApplicationKind[]

export function getApplicationDefinition(
  id: ApplicationId
): (typeof APPLICATION_DEFINITIONS)[ApplicationKind] {
  return APPLICATION_DEFINITIONS[APPLICATION_INSTANCES[id].kind]
}

export function isWslApplication(id: ApplicationId): boolean {
  return APPLICATION_INSTANCES[id].environment === 'wsl'
}

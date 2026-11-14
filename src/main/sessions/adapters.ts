import type { SessionSourceId } from '@shared/sessions'
import { createClaudeSessions } from './claude'
import { createCodexSessions } from './codex'
import { createCopilotCliSessions } from './copilot-cli'
import { createVsCodeSessions } from './vscode'
import type { SessionAdapter, SessionContext } from './types'

export function createSessionAdapters(
  context: SessionContext
): Record<SessionSourceId, SessionAdapter> {
  const claude = createClaudeSessions(context)
  const codex = createCodexSessions(context)
  return {
    'claude-code': claude,
    'claude-code-wsl': claude,
    codex,
    'codex-wsl': codex,
    'copilot-cli': createCopilotCliSessions(context),
    'copilot-vscode': createVsCodeSessions(context)
  }
}

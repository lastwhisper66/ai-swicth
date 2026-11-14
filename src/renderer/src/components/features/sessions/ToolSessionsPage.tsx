import type { SessionSourceId } from '@shared/sessions'
import { ClaudeSessionsPage } from './ClaudeSessionsPage'
import { CodexSessionsPage } from './CodexSessionsPage'
import { CopilotCliSessionsPage } from './CopilotCliSessionsPage'
import { VsCodeSessionsPage } from './VsCodeSessionsPage'

export interface ToolSessionsPageProps {
  sourceId: SessionSourceId
  onHome: () => void
  onBusyChange: (busy: boolean) => void
  onSourceChange: (source: SessionSourceId) => void
}

export function ToolSessionsPage(props: ToolSessionsPageProps): React.JSX.Element {
  switch (props.sourceId) {
    case 'claude-code':
    case 'claude-code-wsl':
      return <ClaudeSessionsPage {...props} sourceId={props.sourceId} />
    case 'codex':
    case 'codex-wsl':
      return <CodexSessionsPage {...props} sourceId={props.sourceId} />
    case 'copilot-cli':
      return <CopilotCliSessionsPage {...props} />
    case 'copilot-vscode':
      return <VsCodeSessionsPage {...props} />
  }
}

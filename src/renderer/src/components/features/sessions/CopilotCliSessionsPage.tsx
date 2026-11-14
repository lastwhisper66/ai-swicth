import { Button } from '@renderer/components/ui/button'
import { SessionBrowser } from './SessionBrowser'
import type { ToolSessionsPageProps } from './ToolSessionsPage'

export function CopilotCliSessionsPage(props: ToolSessionsPageProps): React.JSX.Element {
  return (
    <SessionBrowser
      {...props}
      sourceId="copilot-cli"
      description="管理 Copilot CLI 本地会话。GitHub 上的远端记录由原工具管理。"
      relatedAction={(busy) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => props.onSourceChange('copilot-vscode')}
        >
          VS Code Copilot 会话
        </Button>
      )}
    />
  )
}

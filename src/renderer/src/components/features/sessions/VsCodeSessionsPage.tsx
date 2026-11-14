import { Button } from '@renderer/components/ui/button'
import { SessionBrowser } from './SessionBrowser'
import type { ToolSessionsPageProps } from './ToolSessionsPage'

export function VsCodeSessionsPage(props: ToolSessionsPageProps): React.JSX.Element {
  return (
    <SessionBrowser
      {...props}
      sourceId="copilot-vscode"
      description="已隐藏无消息的空会话；清空全部会一并移除空会话和未发送的草稿。删除前请退出 VS Code。"
      relatedAction={(busy) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => props.onSourceChange('copilot-cli')}
        >
          Copilot CLI 会话
        </Button>
      )}
    />
  )
}

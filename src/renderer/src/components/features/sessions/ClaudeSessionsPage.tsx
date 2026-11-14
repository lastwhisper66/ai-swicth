import { SessionBrowser } from './SessionBrowser'
import type { ToolSessionsPageProps } from './ToolSessionsPage'

export function ClaudeSessionsPage(
  props: Omit<ToolSessionsPageProps, 'sourceId'> & { sourceId: 'claude-code' | 'claude-code-wsl' }
): React.JSX.Element {
  return <SessionBrowser {...props} description="按项目整理对话，查找消息与工具记录。" />
}

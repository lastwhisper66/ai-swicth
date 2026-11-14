import { SessionBrowser } from './SessionBrowser'
import type { ToolSessionsPageProps } from './ToolSessionsPage'

export function CodexSessionsPage(
  props: Omit<ToolSessionsPageProps, 'sourceId'> & { sourceId: 'codex' | 'codex-wsl' }
): React.JSX.Element {
  return <SessionBrowser {...props} description="浏览对话与归档记录，删除预览会包含关联子会话。" />
}

import { RefreshCw, Settings } from 'lucide-react'
import type { ToolId } from '@shared/ipc'
import { ModeToggle } from '@renderer/components/ModeToggle'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Button } from '@renderer/components/ui/button'

interface AppSidebarProps {
  view: ToolId | 'settings'
  busy: boolean
  refreshing: boolean
  onViewChange: (view: ToolId | 'settings') => void
  onRefresh: () => void
}

export function AppSidebar({
  view,
  busy,
  refreshing,
  onViewChange,
  onRefresh
}: AppSidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-44 shrink-0 flex-col border-r bg-muted/25 lg:w-48">
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="工具页面">
        {(['claude-code', 'codex'] as const).map((toolId) => (
          <Button
            key={toolId}
            type="button"
            variant={view === toolId ? 'secondary' : 'ghost'}
            className="h-10 w-full justify-start gap-3 px-3"
            disabled={busy}
            onClick={() => onViewChange(toolId)}
            aria-current={view === toolId ? 'page' : undefined}
          >
            <ToolIcon toolId={toolId} />
            {toolId === 'claude-code' ? 'Claude Code' : 'Codex'}
          </Button>
        ))}
      </nav>
      <div className="space-y-1 border-t p-3">
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full justify-start gap-3 px-3"
          disabled={busy}
          onClick={onRefresh}
          aria-label="刷新工具状态"
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          {refreshing ? '正在刷新…' : '刷新工具状态'}
        </Button>
        <ModeToggle />
        <nav aria-label="应用设置">
          <Button
            type="button"
            variant={view === 'settings' ? 'secondary' : 'ghost'}
            className="h-10 w-full justify-start gap-3 px-3"
            disabled={busy}
            onClick={() => onViewChange('settings')}
            aria-current={view === 'settings' ? 'page' : undefined}
          >
            <Settings aria-hidden="true" />
            设置
          </Button>
        </nav>
      </div>
    </aside>
  )
}

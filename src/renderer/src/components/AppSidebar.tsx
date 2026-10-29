import { TOOL_IDS, TOOL_NAMES } from '@shared/ipc'
import { Settings } from 'lucide-react'
import type { ToolId } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Button } from '@renderer/components/ui/button'

interface AppSidebarProps {
  view: ToolId | 'settings'
  busy: boolean
  onViewChange: (view: ToolId | 'settings') => void
}

export function AppSidebar({ view, busy, onViewChange }: AppSidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-muted/25 lg:w-56">
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="工具页面">
        {TOOL_IDS.map((toolId) => (
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
            {TOOL_NAMES[toolId]}
          </Button>
        ))}
      </nav>
      <div className="space-y-1 border-t p-3">
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

import { baseToolId } from '@shared/ipc'
import type { ToolId } from '@shared/ipc'
import claudeCodeIcon from '@renderer/assets/lobe-icons/claudecode-color.svg'
import codexIcon from '@renderer/assets/lobe-icons/codex.svg'
import { cn } from '@renderer/lib/utils'

interface ToolIconProps {
  toolId: ToolId
  className?: string
}

export function ToolIcon({ toolId, className }: ToolIconProps): React.JSX.Element {
  return (
    <img
      src={baseToolId(toolId) === 'claude-code' ? claudeCodeIcon : codexIcon}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('size-4 shrink-0', baseToolId(toolId) === 'codex' && 'dark:invert', className)}
    />
  )
}

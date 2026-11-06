import { baseToolId } from '@shared/ipc'
import type { ToolId } from '@shared/ipc'
import claudeCodeIcon from '@renderer/assets/lobe-icons/claudecode-color.svg'
import codexIcon from '@renderer/assets/lobe-icons/codex.svg'
import copilotIcon from '@renderer/assets/lobe-icons/githubcopilot.svg'
import { cn } from '@renderer/lib/utils'

interface ToolIconProps {
  toolId: ToolId | 'copilot'
  className?: string
}

export function ToolIcon({ toolId, className }: ToolIconProps): React.JSX.Element {
  const isCodex = toolId !== 'copilot' && baseToolId(toolId) === 'codex'
  return (
    <img
      src={toolId === 'copilot' ? copilotIcon : isCodex ? codexIcon : claudeCodeIcon}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        'size-4 shrink-0',
        (isCodex || toolId === 'copilot') && 'dark:invert',
        className
      )}
    />
  )
}

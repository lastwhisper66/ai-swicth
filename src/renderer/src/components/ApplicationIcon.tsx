import { Orbit, Sparkles, type LucideIcon } from 'lucide-react'
import {
  getApplicationDefinition,
  type ApplicationIconId,
  type ApplicationId
} from '@shared/applications'
import claudeCodeIcon from '@renderer/assets/lobe-icons/claudecode-color.svg'
import codexIcon from '@renderer/assets/lobe-icons/codex.svg'
import { cn } from '@renderer/lib/utils'

type ApplicationIconDefinition =
  { source: string; className?: string } | { component: LucideIcon; className?: string }

const icons: Record<ApplicationIconId, ApplicationIconDefinition> = {
  'claude-code': { source: claudeCodeIcon },
  codex: { source: codexIcon, className: 'dark:invert' },
  'gemini-cli': { component: Sparkles, className: 'text-blue-500' },
  'grok-build': { component: Orbit }
}

export function ApplicationIcon({
  applicationId,
  className
}: {
  applicationId: ApplicationId
  className?: string
}): React.JSX.Element {
  const icon = icons[getApplicationDefinition(applicationId).icon]
  const classes = cn('size-4 shrink-0', icon.className, className)
  if ('source' in icon)
    return <img src={icon.source} alt="" aria-hidden="true" draggable={false} className={classes} />
  const Icon = icon.component
  return <Icon aria-hidden="true" className={classes} />
}

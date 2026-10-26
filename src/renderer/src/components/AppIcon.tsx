import appIcon from '../../../../resources/icon.png'
import { cn } from '@renderer/lib/utils'

export function AppIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <img
      src={appIcon}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('size-7 shrink-0 object-contain', className)}
    />
  )
}

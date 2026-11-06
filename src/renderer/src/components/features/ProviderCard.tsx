import { type ReactNode } from 'react'
import { Globe } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Item, ItemActions, ItemContent } from '@renderer/components/ui/item'

export function ProviderCard({
  name,
  active = false,
  selected = false,
  leading,
  badges,
  actions,
  children
}: {
  name: string
  active?: boolean
  selected?: boolean
  leading?: ReactNode
  badges?: ReactNode
  actions: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <Item
      variant="outline"
      className={cn(
        '@container min-w-0 gap-4 bg-card p-4',
        active && 'border-emerald-600/30 bg-emerald-50/30 dark:bg-emerald-950/15',
        selected && 'ring-2 ring-primary/15'
      )}
    >
      {leading && <div className="shrink-0 self-start">{leading}</div>}
      <ItemContent className="min-w-0 basis-72 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-base font-semibold" title={name}>
            {name}
          </h3>
          {badges}
        </div>
        <dl className="grid min-w-0 gap-3">{children}</dl>
      </ItemContent>
      <ItemActions className="ml-auto shrink-0 flex-wrap justify-end gap-3 self-end">
        {actions}
      </ItemActions>
    </Item>
  )
}

export function ProviderDetail({
  label,
  value,
  Icon
}: {
  label: string
  value: string
  Icon: typeof Globe
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="flex shrink-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 font-mono text-xs leading-5 wrap-anywhere" title={value}>
        {value}
      </dd>
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TOOL_NAMES, type ApplicationPreferences, type ToolId } from '@shared/ipc'
import { APPLICATION_INSTANCES, type ApplicationId } from '@shared/applications'
import {
  AppWindow,
  BarChart3,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings
} from 'lucide-react'
import { AppIcon } from '@renderer/components/AppIcon'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { SortableList, type SortableHandleProps } from '@renderer/components/SortableList'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { moveItem } from '@renderer/lib/sort-order'

interface AppSidebarProps {
  view: ToolId | 'settings' | 'applications' | 'copilot' | 'sessions' | 'usage'
  preferences: ApplicationPreferences
  ready: boolean
  busy: boolean
  collapseSaving: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onOrderChange: (order: ApplicationId[]) => Promise<boolean>
  onViewChange: (
    view: ToolId | 'settings' | 'applications' | 'copilot' | 'sessions' | 'usage'
  ) => void
}

export function AppSidebar({
  view,
  preferences,
  ready,
  busy,
  collapseSaving,
  onCollapsedChange,
  onOrderChange,
  onViewChange
}: AppSidebarProps): React.JSX.Element {
  const [draftOrder, setDraftOrder] = useState<ApplicationId[] | null>(null)
  const [orderSaving, setOrderSaving] = useState(false)
  const savingOrder = useRef(false)
  const collapsed = preferences.sidebarCollapsed
  const [openTooltip, setOpenTooltip] = useState<string | null>(null)
  const [tooltipLayout, setTooltipLayout] = useState(collapsed)
  const tooltipsReady = tooltipLayout === collapsed && !collapseSaving
  const order = draftOrder ?? preferences.order
  const visibleTools = order.flatMap((id) => {
    const toolId = APPLICATION_INSTANCES[id].configurationToolId
    return toolId && preferences.visible[toolId] ? [{ id, label: TOOL_NAMES[toolId] }] : []
  })

  useEffect(() => {
    // Ignore pointer events caused by the sidebar's 200 ms width transition.
    const timer = window.setTimeout(() => {
      setOpenTooltip(null)
      setTooltipLayout(collapsed)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [collapsed])

  function changeTooltip(id: string, open: boolean): void {
    setOpenTooltip((current) => (open ? id : current === id ? null : current))
  }

  async function moveApplication(id: string, targetId: string): Promise<void> {
    if (!ready || busy || savingOrder.current) return
    const next = moveItem(order, id as ApplicationId, targetId as ApplicationId)
    if (next === order) return
    savingOrder.current = true
    setOrderSaving(true)
    setDraftOrder(next)
    try {
      await onOrderChange(next)
    } finally {
      savingOrder.current = false
      setOrderSaving(false)
      setDraftOrder(null)
    }
  }

  function navigationButton(
    id: AppSidebarProps['view'],
    label: string,
    icon: ReactNode,
    dragProps?: SortableHandleProps
  ): React.JSX.Element {
    return (
      <SidebarTooltip
        label={label}
        enabled={collapsed && tooltipsReady && (!dragProps || !!dragProps.ref)}
        open={openTooltip === id}
        onOpenChange={(open) => changeTooltip(id, open)}
      >
        <Button
          {...dragProps}
          type="button"
          variant={view === id ? 'secondary' : 'ghost'}
          className={cn(
            'relative h-11 min-w-0 flex-1 justify-start gap-3 rounded-lg px-3 text-muted-foreground',
            collapsed && 'size-10 flex-none justify-center px-0',
            dragProps && 'touch-none',
            view === id &&
              'bg-background font-semibold text-foreground shadow-xs ring-1 ring-border'
          )}
          disabled={busy}
          onClick={(event) => {
            if (!event.defaultPrevented) onViewChange(id)
          }}
          aria-label={label}
          aria-current={view === id ? 'page' : undefined}
        >
          {view === id && (
            <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary" />
          )}
          {icon}
          {!collapsed && <span className="truncate">{label}</span>}
        </Button>
      </SidebarTooltip>
    )
  }

  return (
    <aside
      aria-label="主侧边栏"
      className={cn(
        'flex h-full w-62 shrink-0 flex-col border-r bg-muted/35 transition-[width] duration-200 motion-reduce:transition-none',
        collapsed && 'w-22'
      )}
    >
      <div
        className={cn(
          'app-titlebar flex h-24 shrink-0 items-center gap-3 px-4 select-none',
          collapsed && 'h-28 flex-col justify-center gap-2 py-3'
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5',
            collapsed && 'flex-none justify-center'
          )}
        >
          <AppIcon className="size-9" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">AI Switch</h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">让 AI 连接更简单</p>
            </div>
          )}
        </div>
        <SidebarTooltip
          label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          enabled={tooltipsReady}
          open={openTooltip === 'sidebar-toggle'}
          onOpenChange={(open) => changeTooltip('sidebar-toggle', open)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn('app-no-drag text-muted-foreground', collapsed && 'size-8')}
            onClick={() => {
              setOpenTooltip(null)
              onCollapsedChange(!collapsed)
            }}
            disabled={!ready || collapseSaving || orderSaving}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!collapsed}
            aria-controls="sidebar-navigation"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </SidebarTooltip>
      </div>

      <nav
        id="sidebar-navigation"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        aria-label="AI 工具"
      >
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between px-3 pt-2 pb-1 text-[11px] text-muted-foreground">
            <span className="font-medium tracking-wider">AI 工具</span>
            {orderSaving && <span role="status">保存中…</span>}
          </div>
        )}
        {visibleTools.length > 0 ? (
          <SortableList
            label="侧边栏 AI 工具"
            items={visibleTools}
            disabled={!ready || busy || orderSaving || collapseSaving}
            onMove={moveApplication}
            className="space-y-1"
            itemClassName={cn('flex items-center p-0.5', collapsed && 'justify-center')}
            renderItem={(_id, handle) => handle}
            renderHandle={(id, dragProps) => {
              const toolId = APPLICATION_INSTANCES[id as ApplicationId].configurationToolId!
              return navigationButton(
                toolId,
                TOOL_NAMES[toolId],
                <ToolIcon toolId={toolId} className="size-5" />,
                dragProps
              )
            }}
          />
        ) : (
          !collapsed && (
            <p className="px-3 py-4 text-xs leading-5 text-muted-foreground">
              可在下方「AI 应用」中显示工具。
            </p>
          )
        )}
        <div className="mt-1 flex p-0.5">
          {navigationButton(
            'copilot',
            'VS Code Copilot',
            <ToolIcon toolId="copilot" className="size-5" />
          )}
        </div>
      </nav>

      <nav
        aria-label="应用管理与设置"
        className={cn('space-y-1 border-t p-3', collapsed && 'px-2')}
      >
        <div className={cn('flex', collapsed && 'justify-center')}>
          {navigationButton(
            'usage',
            '用量统计',
            <BarChart3 className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className={cn('flex', collapsed && 'justify-center')}>
          {navigationButton(
            'sessions',
            '会话',
            <MessageSquareText className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className={cn('flex', collapsed && 'justify-center')}>
          {navigationButton(
            'applications',
            'AI 应用',
            <AppWindow className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className={cn('flex', collapsed && 'justify-center')}>
          {navigationButton('settings', '设置', <Settings className="size-5" aria-hidden="true" />)}
        </div>
      </nav>
    </aside>
  )
}

function SidebarTooltip({
  label,
  enabled,
  open,
  onOpenChange,
  children
}: {
  label: string
  enabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <Tooltip
      open={enabled && open}
      onOpenChange={(nextOpen) => onOpenChange(enabled && nextOpen)}
      delayDuration={300}
      disableHoverableContent
    >
      <TooltipTrigger
        asChild
        onPointerMove={(event) => {
          if (!enabled) event.preventDefault()
        }}
        onFocus={(event) => {
          if (!enabled) event.preventDefault()
        }}
      >
        {children}
      </TooltipTrigger>
      {enabled && (
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

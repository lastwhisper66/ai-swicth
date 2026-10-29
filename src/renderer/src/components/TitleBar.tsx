import { useEffect, useState } from 'react'
import { Copy, Minus, RefreshCw, Square, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiResult } from '@shared/ipc'
import { AppIcon } from '@renderer/components/AppIcon'
import { ModeToggle } from '@renderer/components/ModeToggle'
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'

interface TitleBarProps {
  busy?: boolean
  refreshing?: boolean
  onRefresh?: () => void
}

export function TitleBar({
  busy = false,
  refreshing = false,
  onRefresh
}: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const api = window.api?.window
    if (!api) return
    let active = true
    const unsubscribe = api.onStateChanged((state) => setIsMaximized(state.isMaximized))
    void api
      .getState()
      .then((result) => {
        if (active && result.ok) setIsMaximized(result.value.isMaximized)
      })
      .catch(() => {})
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  async function controlWindow(action: 'minimize' | 'toggleMaximize' | 'close'): Promise<void> {
    try {
      const api = window.api?.window
      if (!api) throw new Error('窗口接口未加载，请重新打开应用。')
      const result: ApiResult<unknown> = await api[action]()
      if (!result.ok) throw new Error(result.error.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '窗口操作失败，请重试。', {
        id: 'window-control'
      })
    }
  }

  return (
    <header className="app-titlebar flex h-11 shrink-0 items-center justify-between border-b bg-background select-none">
      <div className="flex min-w-0 items-center gap-2.5 pl-4">
        <AppIcon className="size-6" />
        <span className="truncate text-xs font-semibold tracking-wide">AI Switch</span>
      </div>
      <div className="app-no-drag flex h-full shrink-0 items-stretch" aria-label="应用与窗口控制">
        <div className="flex items-center gap-1 border-r px-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground active:translate-y-0"
                  disabled={busy || !onRefresh}
                  onClick={onRefresh}
                  aria-label="刷新工具状态"
                  aria-busy={refreshing}
                >
                  <RefreshCw
                    className={refreshing ? 'animate-spin' : undefined}
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                刷新工具状态
              </TooltipContent>
            </Tooltip>
            <ModeToggle />
          </TooltipProvider>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-full w-12 rounded-none text-muted-foreground active:translate-y-0"
          onClick={() => void controlWindow('minimize')}
          aria-label="最小化窗口"
          title="最小化"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-full w-12 rounded-none text-muted-foreground active:translate-y-0"
          onClick={() => void controlWindow('toggleMaximize')}
          aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <Copy className="size-3" aria-hidden="true" />
          ) : (
            <Square className="size-3" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-full w-12 rounded-none text-muted-foreground hover:bg-red-600 hover:text-white active:translate-y-0 dark:hover:bg-red-600"
          onClick={() => void controlWindow('close')}
          aria-label="关闭窗口"
          title="关闭"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}

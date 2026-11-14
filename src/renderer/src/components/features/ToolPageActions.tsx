import { ArrowLeft, MessageSquareText, Plus, SlidersHorizontal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

export type ToolPageSection = 'home' | 'configuration' | 'editor'

export function ToolPageActions({
  section,
  busy,
  onHome,
  onAdd,
  onConfigure,
  onSessions
}: {
  section: ToolPageSection
  busy: boolean
  onHome: () => void
  onAdd: () => void
  onConfigure: () => void
  onSessions?: () => void
}): React.JSX.Element {
  return (
    <div
      className="ml-auto flex flex-wrap items-center gap-3 self-center"
      aria-label="当前工具操作"
    >
      {section !== 'home' && (
        <Button
          variant="outline"
          className="h-11 gap-2 px-4 shadow-sm"
          disabled={busy}
          onClick={onHome}
        >
          <ArrowLeft aria-hidden="true" />
          返回首页
        </Button>
      )}
      <Button className="h-11 gap-2 px-5 font-semibold shadow-sm" disabled={busy} onClick={onAdd}>
        <Plus aria-hidden="true" />
        添加供应商
      </Button>
      <Button
        variant="outline"
        className="h-11 gap-2 border-foreground/25 bg-background px-5 font-semibold shadow-sm hover:border-foreground/50 aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground dark:bg-background dark:aria-[current=page]:bg-primary"
        disabled={busy}
        onClick={onConfigure}
        aria-current={section === 'configuration' ? 'page' : undefined}
      >
        <SlidersHorizontal aria-hidden="true" />
        功能配置
      </Button>
      {onSessions && (
        <Button variant="outline" className="h-11 gap-2 px-5" disabled={busy} onClick={onSessions}>
          <MessageSquareText aria-hidden="true" />
          会话管理
        </Button>
      )}
    </div>
  )
}

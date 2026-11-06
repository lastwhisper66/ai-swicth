import { FolderOpen, SlidersHorizontal } from 'lucide-react'
import {
  baseToolId,
  type AppSnapshot,
  type OpenToolLocationInput,
  type ProviderSummary,
  type ToolId,
  type ToolStatus
} from '@shared/ipc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { CommonConfigPage } from './CommonConfigPage'
import { ToolPathSettings } from './ToolPathSettings'

const tabClassName =
  'h-11 gap-2 border-foreground/20 bg-background px-5 font-semibold text-foreground shadow-sm hover:bg-muted data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:bg-background dark:text-foreground dark:data-[state=active]:border-primary dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground'

export function ToolFeaturesPage({
  toolId,
  providers,
  status,
  statusError,
  busy,
  onRetry,
  onPickPath,
  onResetPath,
  onOpenLocation,
  onPendingChange,
  onSaved
}: {
  toolId: ToolId
  providers: ProviderSummary[]
  status: ToolStatus | undefined
  statusError?: string
  busy: boolean
  onRetry: () => void
  onPickPath: (toolId: ToolId) => void
  onResetPath: (toolId: ToolId) => void
  onOpenLocation: (input: OpenToolLocationInput) => void
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}): React.JSX.Element {
  return (
    <Tabs defaultValue="features" className="min-w-0 gap-5">
      <TabsList
        aria-label="工具功能配置"
        className="grid w-full grid-cols-2 gap-2 rounded-xl border bg-muted/50 p-2 group-data-[orientation=horizontal]/tabs:h-auto sm:w-fit"
      >
        <TabsTrigger value="features" className={tabClassName} disabled={busy}>
          <SlidersHorizontal aria-hidden="true" />
          功能选项
        </TabsTrigger>
        <TabsTrigger value="paths" className={tabClassName} disabled={busy}>
          <FolderOpen aria-hidden="true" />
          配置路径
        </TabsTrigger>
      </TabsList>
      <TabsContent value="features" forceMount className="data-[state=inactive]:hidden">
        <CommonConfigPage
          toolId={baseToolId(toolId)}
          providers={providers}
          busy={busy}
          onPendingChange={onPendingChange}
          onSaved={onSaved}
        />
      </TabsContent>
      <TabsContent value="paths">
        <ToolPathSettings
          toolId={toolId}
          status={status}
          error={statusError}
          busy={busy}
          onRetry={onRetry}
          onPick={onPickPath}
          onReset={onResetPath}
          onOpenLocation={onOpenLocation}
        />
      </TabsContent>
    </Tabs>
  )
}

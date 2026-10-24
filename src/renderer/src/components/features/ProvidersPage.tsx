import { Plus } from 'lucide-react'
import { TOOL_IDS, type ProviderSummary, type ToolId, type ToolStatus } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Button } from '@renderer/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { ProviderCard } from './ProviderCard'

interface ProvidersPageProps {
  providers: ProviderSummary[]
  tools: Record<ToolId, ToolStatus>
  busy: boolean
  toolId: ToolId
  onToolChange: (toolId: ToolId) => void
  onAdd: (toolId: ToolId) => void
  onEdit: (provider: ProviderSummary, toolId: ToolId) => void
  onDelete: (providerId: string) => void
}

export function ProvidersPage({
  providers,
  tools,
  busy,
  toolId,
  onToolChange,
  onAdd,
  onEdit,
  onDelete
}: ProvidersPageProps): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">供应商设置</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            分别管理两个工具的供应商，API Key 仅在本机加密存储。
          </p>
        </div>
      </div>

      <Tabs
        value={toolId}
        onValueChange={(value) => {
          if (value === 'claude-code' || value === 'codex') onToolChange(value)
        }}
        className="gap-5"
      >
        <TabsList className="h-11 max-w-full" aria-label="供应商所属工具">
          {TOOL_IDS.map((id) => (
            <TabsTrigger key={id} value={id} disabled={busy} className="gap-2 px-4">
              <ToolIcon toolId={id} />
              {id === 'claude-code' ? 'Claude Code' : 'Codex'}
              <span className="text-xs text-muted-foreground">
                {providers.filter((provider) => provider.tools.includes(id)).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {TOOL_IDS.map((id) => {
          const toolName = id === 'claude-code' ? 'Claude Code' : 'Codex'
          const toolProviders = providers.filter((provider) => provider.tools.includes(id))
          return (
            <TabsContent key={id} value={id} className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{toolName} 供应商</p>
                <Button onClick={() => onAdd(id)} disabled={busy}>
                  <Plus aria-hidden="true" />
                  添加 {toolName} 供应商
                </Button>
              </div>
              {toolProviders.length === 0 ? (
                <Empty className="border bg-card py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ToolIcon toolId={id} />
                    </EmptyMedia>
                    <EmptyTitle>尚无 {toolName} 供应商</EmptyTitle>
                    <EmptyDescription>
                      在这里添加，保存后可前往 {toolName} 页面应用。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {toolProviders.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      toolId={id}
                      busy={busy}
                      isCurrent={provider.id === tools[id].currentProviderId}
                      onEdit={() => onEdit(provider, id)}
                      onDelete={() => onDelete(provider.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

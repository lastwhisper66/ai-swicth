import { baseToolId, PROVIDER_TOOL_IDS, TOOL_NAMES, type ProviderToolId } from '@shared/ipc'
import { Plus } from 'lucide-react'
import { type ProviderSummary, type ToolId, type ToolStatus } from '@shared/ipc'
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
import { ProviderRow } from './ProviderRow'

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
            按工具管理供应商，本机与 WSL 共用地址、API
            Key、模型和连接选项。保存后可分别应用到对应环境。
          </p>
        </div>
      </div>

      <Tabs
        value={baseToolId(toolId)}
        onValueChange={(value) => {
          if (PROVIDER_TOOL_IDS.includes(value as ProviderToolId))
            onToolChange(value as ProviderToolId)
        }}
        className="gap-5"
      >
        <TabsList
          className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto xl:inline-flex xl:w-auto"
          aria-label="供应商所属工具"
        >
          {PROVIDER_TOOL_IDS.map((id) => (
            <TabsTrigger key={id} value={id} disabled={busy} className="h-9 gap-2 px-3">
              <ToolIcon toolId={id} />
              {TOOL_NAMES[id]}
              <span className="text-xs text-muted-foreground">
                {providers.filter((provider) => provider.tools.includes(id)).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {PROVIDER_TOOL_IDS.map((id) => {
          const toolName = TOOL_NAMES[id]
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
                <ul
                  className="grid list-none grid-cols-1 gap-3 p-0"
                  aria-label={`${toolName} 供应商设置`}
                >
                  {toolProviders.map((provider) => {
                    const activeTools = Object.values(tools).filter(
                      (tool) =>
                        baseToolId(tool.toolId) === id && tool.currentProviderId === provider.id
                    )
                    return (
                      <li key={provider.id} className="min-w-0">
                        <ProviderRow
                          provider={provider}
                          toolId={id}
                          busy={busy}
                          isCurrent={activeTools.length > 0}
                          currentModelId={activeTools[0]?.currentModelId ?? null}
                          usageLabels={activeTools.map((tool) => TOOL_NAMES[tool.toolId])}
                          onEdit={() => onEdit(provider, id)}
                          onDelete={() => onDelete(provider.id)}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

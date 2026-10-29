import { TOOL_NAMES } from '@shared/ipc'
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
            分别管理本机和 WSL 的供应商，API Key
            保存在本机应用数据目录中；上传云端时会使用备份密码整体加密。
          </p>
        </div>
      </div>

      <Tabs
        value={toolId}
        onValueChange={(value) => {
          if (TOOL_IDS.includes(value as ToolId)) onToolChange(value as ToolId)
        }}
        className="gap-5"
      >
        <TabsList
          className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto xl:inline-flex xl:w-auto"
          aria-label="供应商所属工具"
        >
          {TOOL_IDS.map((id) => (
            <TabsTrigger key={id} value={id} disabled={busy} className="h-9 gap-2 px-3">
              <ToolIcon toolId={id} />
              {TOOL_NAMES[id]}
              <span className="text-xs text-muted-foreground">
                {providers.filter((provider) => provider.tools.includes(id)).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {TOOL_IDS.map((id) => {
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
                  {toolProviders.map((provider) => (
                    <li key={provider.id} className="min-w-0">
                      <ProviderRow
                        provider={provider}
                        toolId={id}
                        busy={busy}
                        isCurrent={provider.id === tools[id].currentProviderId}
                        currentModelId={
                          provider.id === tools[id].currentProviderId
                            ? tools[id].currentModelId
                            : null
                        }
                        onEdit={() => onEdit(provider, id)}
                        onDelete={() => onDelete(provider.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

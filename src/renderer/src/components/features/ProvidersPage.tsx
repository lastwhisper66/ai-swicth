import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { TOOL_IDS, type ProviderSummary, type ToolId } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ConfigPreview } from './ConfigPreview'

interface ProvidersPageProps {
  providers: ProviderSummary[]
  busy: boolean
  toolId: ToolId
  onToolChange: (toolId: ToolId) => void
  onAdd: (toolId: ToolId) => void
  onEdit: (provider: ProviderSummary, toolId: ToolId) => void
  onDelete: (providerId: string) => void
}

export function ProvidersPage({
  providers,
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
                      onEdit={(provider) => onEdit(provider, id)}
                      onDelete={onDelete}
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

function ProviderCard({
  provider,
  toolId,
  busy,
  onEdit,
  onDelete
}: {
  provider: ProviderSummary
  toolId: ToolId
  busy: boolean
  onEdit: (provider: ProviderSummary) => void
  onDelete: (providerId: string) => void
}): React.JSX.Element {
  return (
    <Card className="min-w-0 gap-4">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{provider.name}</CardTitle>
          <p
            className="mt-1 truncate font-mono text-xs text-muted-foreground"
            title={provider.baseUrl}
          >
            {provider.baseUrl}
          </p>
        </div>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(provider)}
                disabled={busy}
                aria-label={`编辑 ${provider.name}`}
              >
                <Pencil aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑供应商</TooltipContent>
          </Tooltip>
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`删除 ${provider.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>删除供应商</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Trash2 aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>删除 {provider.name}？</AlertDialogTitle>
                <AlertDialogDescription>
                  这会删除 AI Switch 中保存的信息，但不会撤销已经写入 Claude Code 或 Codex 的配置。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => onDelete(provider.id)}>
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{toolId === 'claude-code' ? 'Claude Code' : 'Codex'}</Badge>
          {provider.tools.length > 1 && <Badge variant="outline">共用供应商</Badge>}
          <Badge variant="outline">
            <KeyRound aria-hidden="true" />
            {provider.maskedApiKey}
          </Badge>
        </div>
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 text-xs">
          <span className="text-muted-foreground">模型名称</span>
          <span className="truncate font-mono" title={provider.models[toolId]}>
            {provider.models[toolId]}
          </span>
        </div>
        <ConfigPreview input={{ toolId, providerId: provider.id }} disabled={busy} />
      </CardContent>
    </Card>
  )
}

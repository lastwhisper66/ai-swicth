import { Braces, Code2, LoaderCircle, RotateCcw } from 'lucide-react'
import type { ProviderSummary, ToolId, ToolStatus } from '@shared/ipc'
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

interface ToolSwitchPanelProps {
  toolId: ToolId
  status: ToolStatus
  providers: ProviderSummary[]
  selectedProviderId: string
  pending: boolean
  busy: boolean
  onSelectedProviderChange: (providerId: string) => void
  onApply: (toolId: ToolId, providerId: string) => void
}

const toolDetails = {
  'claude-code': {
    name: 'Claude Code',
    protocol: 'Anthropic Messages',
    Icon: Code2
  },
  codex: {
    name: 'Codex',
    protocol: 'OpenAI Responses',
    Icon: Braces
  }
} as const

export function ToolSwitchPanel({
  toolId,
  status,
  providers,
  selectedProviderId,
  pending,
  busy,
  onSelectedProviderChange,
  onApply
}: ToolSwitchPanelProps): React.JSX.Element {
  const details = toolDetails[toolId]
  const compatibleProviders = providers.filter((provider) => provider.tools.includes(toolId))
  const selectedProvider = compatibleProviders.find(
    (provider) => provider.id === selectedProviderId
  )
  const Icon = details.Icon

  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <CardHeader className="border-b bg-muted/35 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{details.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{details.protocol} 兼容供应商</p>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 py-5">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <span className="text-muted-foreground">当前供应商</span>
          <span className="truncate font-medium">
            {status.currentProviderName ?? (status.isExternalConfig ? '外部配置' : '未配置')}
          </span>
          <span className="text-muted-foreground">当前模型</span>
          <span className="truncate font-mono text-xs">{status.model ?? '—'}</span>
          <span className="text-muted-foreground">配置路径</span>
          <span className="truncate font-mono text-xs" title={status.path}>
            {status.path}
          </span>
        </div>

        <div className="rounded-lg border bg-muted/25 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          {status.statusMessage}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${toolId}-provider`}>
            切换到
          </label>
          <Select
            value={selectedProviderId || undefined}
            onValueChange={onSelectedProviderChange}
            disabled={busy || compatibleProviders.length === 0}
          >
            <SelectTrigger id={`${toolId}-provider`} className="w-full">
              <SelectValue placeholder="选择供应商" />
            </SelectTrigger>
            <SelectContent position="popper">
              {compatibleProviders.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  <span>{provider.name}</span>
                  <span className="text-xs text-muted-foreground">{provider.models[toolId]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {compatibleProviders.length === 0 && (
            <p className="text-xs text-muted-foreground">请先添加适用于该工具的供应商。</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="border-t bg-muted/20 py-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full" disabled={!selectedProvider || busy}>
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              应用到 {details.name}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <RotateCcw aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>应用供应商配置？</AlertDialogTitle>
              <AlertDialogDescription className="wrap-break-word">
                将把 {selectedProvider?.name} 写入 {status.path}。写入前会创建加密备份，API Key 将按{' '}
                {details.name} 要求以明文保存在目标配置中。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedProvider && onApply(toolId, selectedProvider.id)}
              >
                确认应用
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  )
}

function StatusBadge({ status }: { status: ToolStatus }): React.JSX.Element {
  if (status.fileState === 'invalid' || status.fileState === 'unreadable') {
    return (
      <Badge variant="destructive" className="ml-auto shrink-0">
        需处理
      </Badge>
    )
  }
  if (status.currentProviderId) {
    return (
      <Badge className="ml-auto shrink-0 bg-emerald-600 text-white hover:bg-emerald-600">
        已匹配
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="ml-auto shrink-0">
      {status.fileState === 'missing' ? '未创建' : '未匹配'}
    </Badge>
  )
}

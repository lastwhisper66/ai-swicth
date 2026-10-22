import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ProviderSummary } from '@shared/ipc'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

interface ProvidersPageProps {
  providers: ProviderSummary[]
  busy: boolean
  onAdd: () => void
  onEdit: (provider: ProviderSummary) => void
  onDelete: (providerId: string) => void
}

export function ProvidersPage({
  providers,
  busy,
  onAdd,
  onEdit,
  onDelete
}: ProvidersPageProps): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">供应商</h2>
          <p className="mt-1 text-sm text-muted-foreground">API Key 仅在本机加密存储。</p>
        </div>
        <Button onClick={onAdd} disabled={busy}>
          <Plus aria-hidden="true" />
          添加供应商
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <KeyRound className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">尚无供应商</p>
          <p className="mt-1 text-xs text-muted-foreground">
            添加后可分别应用到 Claude Code 或 Codex。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busy={busy}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProviderCard({
  provider,
  busy,
  onEdit,
  onDelete
}: {
  provider: ProviderSummary
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
          {provider.tools.map((toolId) => (
            <Badge key={toolId} variant="secondary">
              {toolId === 'claude-code' ? 'Claude Code' : 'Codex'}
            </Badge>
          ))}
          <Badge variant="outline">
            <KeyRound aria-hidden="true" />
            {provider.maskedApiKey}
          </Badge>
        </div>
        <div className="space-y-2 text-xs">
          {provider.tools.map((toolId) => (
            <div key={toolId} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
              <span className="text-muted-foreground">
                {toolId === 'claude-code' ? 'Claude 模型' : 'Codex 模型'}
              </span>
              <span className="truncate font-mono">{provider.models[toolId]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

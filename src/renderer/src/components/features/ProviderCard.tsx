import { Check, Cpu, Globe, KeyRound, Pencil, Play, Trash2 } from 'lucide-react'
import type { ProviderSummary, ToolId } from '@shared/ipc'
import { cn } from '@renderer/lib/utils'
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
import { Spinner } from '@renderer/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

interface ProviderCardProps {
  provider: ProviderSummary
  toolId: ToolId
  isCurrent: boolean
  busy: boolean
  pending?: boolean
  onApply?: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ProviderCard({
  provider,
  toolId,
  isCurrent,
  busy,
  pending = false,
  onApply,
  onEdit,
  onDelete
}: ProviderCardProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        'h-full min-w-0 gap-4 transition-shadow hover:shadow-sm',
        isCurrent && 'bg-emerald-50/30 ring-emerald-600/30 dark:bg-emerald-950/15'
      )}
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-40 space-y-2">
          <CardTitle className="truncate text-base font-semibold" title={provider.name}>
            {provider.name}
          </CardTitle>
          {(isCurrent || provider.tools.length > 1) && (
            <div className="flex flex-wrap gap-2">
              {isCurrent && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  <Check aria-hidden="true" />
                  当前使用
                </Badge>
              )}
              {provider.tools.length > 1 && <Badge variant="outline">共用供应商</Badge>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onApply && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant={isCurrent ? 'outline' : 'default'} disabled={busy}>
                  {pending ? <Spinner aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {pending ? '应用中…' : '应用'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <Play aria-hidden="true" />
                  </AlertDialogMedia>
                  <AlertDialogTitle className="wrap-anywhere">
                    应用 {provider.name}？
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    将把配置写入 {toolId === 'claude-code' ? 'Claude Code' : 'Codex'}
                    。写入前会创建备份，API Key 会按工具要求保存在本地配置文件中。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={onApply}>确认应用</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
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
                <AlertDialogTitle className="wrap-anywhere">
                  删除 {provider.name}？
                </AlertDialogTitle>
                <AlertDialogDescription>
                  这会删除 AI Switch 中保存的信息，不会撤销已经写入工具的配置。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete}>
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid min-w-0 gap-4 rounded-lg bg-muted/45 p-3 sm:grid-cols-2">
          <ProviderDetail label="Base URL" value={provider.baseUrl} Icon={Globe} fullWidth />
          <ProviderDetail label="模型" value={provider.models[toolId] ?? '—'} Icon={Cpu} />
          <ProviderDetail label="API Key" value={provider.maskedApiKey} Icon={KeyRound} />
        </dl>
      </CardContent>
    </Card>
  )
}

function ProviderDetail({
  label,
  value,
  Icon,
  fullWidth = false
}: {
  label: string
  value: string
  Icon: typeof Globe
  fullWidth?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('min-w-0 space-y-1.5', fullWidth && 'sm:col-span-2')}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="truncate font-mono text-xs leading-5" title={value}>
        {value}
      </dd>
    </div>
  )
}

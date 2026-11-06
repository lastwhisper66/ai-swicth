import {
  Check,
  CircleCheck,
  Cpu,
  Ellipsis,
  Globe,
  KeyRound,
  Pencil,
  Play,
  Trash2
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ProviderSummary, ToolId } from '@shared/ipc'
import { baseToolId } from '@shared/ipc'
import { cn } from '@renderer/lib/utils'
import { modelPresetChoices } from '@renderer/lib/provider-form'
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
import { Spinner } from '@renderer/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { ConfigurationSelect } from './ConfigurationSelect'
import { ProviderCard, ProviderDetail } from './ProviderCard'

interface ProviderRowProps {
  provider: ProviderSummary
  toolId: ToolId
  isCurrent: boolean
  busy: boolean
  pending?: boolean
  applyDisabled?: boolean
  onApply: (modelId: string) => void
  currentModelId?: string | null
  usageLabels?: string[]
  dragHandle?: ReactNode
  onEdit: () => void
  onDelete: () => void
}

export function ProviderRow({
  provider,
  toolId,
  isCurrent,
  busy,
  pending = false,
  applyDisabled = false,
  onApply,
  onEdit,
  onDelete,
  currentModelId,
  usageLabels,
  dragHandle
}: ProviderRowProps): React.JSX.Element {
  const config = provider.configurations[baseToolId(toolId)]!
  const [selectedModelId, setSelectedModelId] = useState<string>()
  const selected =
    config.models.find(
      (model) => model.id === (selectedModelId ?? currentModelId ?? config.defaultModelId)
    ) ?? config.models.find((model) => model.id === config.defaultModelId)!
  const isAppliedModel = isCurrent && selected.id === currentModelId
  return (
    <ProviderCard
      name={provider.name}
      active={isCurrent}
      leading={dragHandle}
      badges={
        <>
          {isCurrent && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <Check aria-hidden="true" />
              当前使用
            </Badge>
          )}
          {usageLabels?.map((label) => (
            <Badge key={label} variant="outline" className="text-muted-foreground">
              <Check aria-hidden="true" />
              {label} 使用中
            </Badge>
          ))}
          {provider.tools.length > 1 && <Badge variant="outline">共用供应商</Badge>}
        </>
      }
      actions={
        <>
          <Button
            type="button"
            variant={isCurrent ? 'outline' : 'default'}
            disabled={busy || applyDisabled}
            onClick={() => onApply(selected.id)}
          >
            {pending ? <Spinner aria-hidden="true" /> : <Play aria-hidden="true" />}
            {pending ? '应用中…' : '应用'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            disabled={busy}
            aria-label={`编辑 ${provider.name}`}
          >
            <Pencil aria-hidden="true" />
            编辑
          </Button>
          <AlertDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  aria-label={`更多 ${provider.name}`}
                  title="更多"
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem variant="destructive">
                    <Trash2 aria-hidden="true" />
                    删除供应商
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
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
        </>
      }
    >
      <ProviderDetail label="Base URL" value={provider.baseUrl} Icon={Globe} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <dt className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Cpu className="size-3.5" aria-hidden="true" />
            切换模型
          </dt>
          <dd className="w-64 min-w-0 max-w-full">
            <ConfigurationSelect
              label="切换模型"
              hideLabel
              value={selected.id}
              choices={modelPresetChoices(toolId, config.models)}
              onChange={setSelectedModelId}
              disabled={busy}
              indicator={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span role="img" aria-label={isAppliedModel ? '该模型已应用' : '该模型待应用'}>
                      <CircleCheck
                        className={cn(
                          'size-4',
                          isAppliedModel ? 'fill-emerald-600 text-white' : 'text-muted-foreground'
                        )}
                        aria-hidden="true"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isAppliedModel ? '该模型已应用' : '该模型待应用'}
                  </TooltipContent>
                </Tooltip>
              }
            />
          </dd>
        </div>
        <ProviderDetail label="API Key" value={provider.maskedApiKey} Icon={KeyRound} />
      </div>
    </ProviderCard>
  )
}

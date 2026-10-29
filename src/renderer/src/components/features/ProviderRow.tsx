import { Check, CircleCheck, Cpu, Globe, KeyRound, Pencil, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ProviderSummary, ToolId } from '@shared/ipc'
import { baseToolId } from '@shared/ipc'
import { nativeModel } from '@shared/configuration'
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
import { Item, ItemActions, ItemContent } from '@renderer/components/ui/item'
import { Spinner } from '@renderer/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ConfigurationSelect } from './ConfigurationSelect'

interface ProviderRowProps {
  provider: ProviderSummary
  toolId: ToolId
  isCurrent: boolean
  busy: boolean
  pending?: boolean
  onApply?: (modelId: string) => void
  currentModelId?: string | null
  usageLabels?: string[]
  onEdit: () => void
  onDelete: () => void
}

export function ProviderRow({
  provider,
  toolId,
  isCurrent,
  busy,
  pending = false,
  onApply,
  onEdit,
  onDelete,
  currentModelId,
  usageLabels
}: ProviderRowProps): React.JSX.Element {
  const config = provider.configurations[baseToolId(toolId)]!
  const [selectedModelId, setSelectedModelId] = useState<string>()
  const selected =
    config.models.find(
      (model) => model.id === (selectedModelId ?? currentModelId ?? config.defaultModelId)
    ) ?? config.models.find((model) => model.id === config.defaultModelId)!
  const isAppliedModel = isCurrent && selected.id === currentModelId
  return (
    <Item
      variant="outline"
      className={cn(
        '@container min-w-0 gap-4 bg-card p-4',
        isCurrent && 'border-emerald-600/30 bg-emerald-50/30 dark:bg-emerald-950/15'
      )}
    >
      <ItemContent className="min-w-0 max-w-3xl basis-72 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-base font-semibold" title={provider.name}>
            {provider.name}
          </h3>
          {isCurrent && !usageLabels && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <Check aria-hidden="true" />
              当前使用
            </Badge>
          )}
          {usageLabels?.map((label) => (
            <Badge key={label} className="bg-emerald-600 text-white hover:bg-emerald-600">
              <Check aria-hidden="true" />
              {label} 使用中
            </Badge>
          ))}
          {provider.tools.length > 1 && <Badge variant="outline">共用供应商</Badge>}
        </div>
        <dl
          className={cn(
            'grid min-w-0 gap-x-5 gap-y-3',
            !onApply && '@xl:grid-cols-2 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'
          )}
        >
          <ProviderDetail
            label="Base URL"
            value={provider.baseUrl}
            Icon={Globe}
            fullWidth={!onApply}
            inline={Boolean(onApply)}
          />
          <ProviderDetail
            label={onApply ? '模型' : `模型（${config.models.length} 个预设）`}
            value={nativeModel(toolId, selected)}
            Icon={Cpu}
            inline={Boolean(onApply)}
          />
          {!onApply && (
            <ProviderDetail label="API Key" value={provider.maskedApiKey} Icon={KeyRound} />
          )}
        </dl>
      </ItemContent>
      <ItemActions className="flex-wrap items-end justify-end gap-4">
        {onApply && (
          <div className="w-52 min-w-0 max-w-full">
            <ConfigurationSelect
              label="应用模型"
              value={selected.id}
              choices={config.models.map((model) => [model.id, model.name])}
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
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {onApply && (
            <Button
              type="button"
              variant={isCurrent ? 'outline' : 'default'}
              disabled={busy}
              onClick={() => onApply(selected.id)}
            >
              {pending ? <Spinner aria-hidden="true" /> : <Play aria-hidden="true" />}
              {pending ? '应用中…' : '应用'}
            </Button>
          )}
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
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                aria-label={`删除 ${provider.name}`}
              >
                <Trash2 aria-hidden="true" />
                删除
              </Button>
            </AlertDialogTrigger>
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
      </ItemActions>
    </Item>
  )
}

function ProviderDetail({
  label,
  value,
  Icon,
  fullWidth = false,
  inline = false
}: {
  label: string
  value: string
  Icon: typeof Globe
  fullWidth?: boolean
  inline?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'min-w-0',
        inline ? 'flex items-start gap-2' : 'space-y-1',
        fullWidth && '@xl:col-span-2 @4xl:col-span-1'
      )}
    >
      <dt className="flex shrink-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd
        className={cn('min-w-0 font-mono text-xs leading-5', inline ? 'wrap-anywhere' : 'truncate')}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

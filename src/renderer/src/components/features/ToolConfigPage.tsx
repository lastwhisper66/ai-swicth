import { Info, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { ProviderSummary, ToolId, ToolStatus } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
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
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { Item, ItemActions, ItemGroup } from '@renderer/components/ui/item'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Spinner } from '@renderer/components/ui/spinner'
import { ConfigPreview } from './ConfigPreview'

interface ToolConfigPageProps {
  toolId: ToolId
  status: ToolStatus
  providers: ProviderSummary[]
  busy: boolean
  pending: boolean
  selectedProviderId: string
  onSelectedProviderChange: (providerId: string) => void
  onApply: (toolId: ToolId, providerId: string) => void
  onAdd: (toolId: ToolId) => void
  onEdit: (provider: ProviderSummary) => void
  onDelete: (providerId: string) => void
}

const toolDetails = {
  'claude-code': {
    name: 'Claude Code',
    protocol: 'Anthropic Messages',
    description: '管理 Claude Code 使用的供应商与模型。'
  },
  codex: {
    name: 'Codex',
    protocol: 'OpenAI Responses',
    description: '管理 Codex 使用的供应商与模型。'
  }
} as const

export function ToolConfigPage({
  toolId,
  status,
  providers,
  busy,
  pending,
  selectedProviderId,
  onSelectedProviderChange,
  onApply,
  onAdd,
  onEdit,
  onDelete
}: ToolConfigPageProps): React.JSX.Element {
  const details = toolDetails[toolId]
  const compatibleProviders = providers.filter((provider) => provider.tools.includes(toolId))

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b bg-muted/35 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
              <ToolIcon toolId={toolId} className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">{details.name}</CardTitle>
                <StatusBadge status={status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{details.description}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-3">
          <InfoItem
            label="当前供应商"
            value={status.currentProviderName ?? (status.isExternalConfig ? '外部配置' : '未配置')}
          />
          <InfoItem label="当前模型" value={status.model ?? '—'} mono />
          <InfoItem label="配置文件" value={status.path} mono />
          <Alert className="bg-muted/25 sm:col-span-3" role="status">
            <Info aria-hidden="true" />
            <AlertDescription className="text-xs leading-5 wrap-anywhere">
              {status.statusMessage}
            </AlertDescription>
          </Alert>
          <div className="min-w-0 sm:col-span-3">
            <ConfigPreview
              key={`${toolId}:${status.path}:${busy}`}
              input={{ toolId }}
              disabled={busy}
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">供应商</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              选择并应用一个供应商到 {details.name}。
            </p>
          </div>
          <Button onClick={() => onAdd(toolId)} disabled={busy}>
            <Plus aria-hidden="true" />
            添加供应商
          </Button>
        </div>

        {compatibleProviders.length === 0 ? (
          <Empty className="border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ToolIcon toolId={toolId} />
              </EmptyMedia>
              <EmptyTitle>尚无适用于 {details.name} 的供应商</EmptyTitle>
              <EmptyDescription>点击“添加供应商”开始配置。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <RadioGroup
            value={selectedProviderId}
            onValueChange={onSelectedProviderChange}
            disabled={busy}
            aria-label={`选择 ${details.name} 供应商`}
          >
            <ItemGroup
              role="presentation"
              className="gap-0 divide-y overflow-hidden rounded-xl border bg-card"
            >
              {compatibleProviders.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  toolId={toolId}
                  isCurrent={provider.id === status.currentProviderId}
                  isSelected={provider.id === selectedProviderId}
                  pending={pending}
                  busy={busy}
                  onApply={() => {
                    onSelectedProviderChange(provider.id)
                    onApply(toolId, provider.id)
                  }}
                  onEdit={() => onEdit(provider)}
                  onDelete={() => onDelete(provider.id)}
                />
              ))}
            </ItemGroup>
          </RadioGroup>
        )}
      </section>
    </div>
  )
}

function InfoItem({
  label,
  value,
  mono = false
}: {
  label: string
  value: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`truncate text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function ProviderRow({
  provider,
  toolId,
  isCurrent,
  isSelected,
  pending,
  busy,
  onApply,
  onEdit,
  onDelete
}: {
  provider: ProviderSummary
  toolId: ToolId
  isCurrent: boolean
  isSelected: boolean
  pending: boolean
  busy: boolean
  onApply: () => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <Item
      data-selected={isSelected}
      className="grid gap-3 rounded-none border-0 p-4 data-[selected=true]:bg-muted/35 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
    >
      <Field orientation="horizontal" className="min-w-0 gap-3">
        <RadioGroupItem
          id={`select-${toolId}-${provider.id}`}
          value={provider.id}
          aria-labelledby={`provider-title-${toolId}-${provider.id}`}
          aria-describedby={`provider-description-${toolId}-${provider.id}`}
        />
        <FieldLabel
          htmlFor={`select-${toolId}-${provider.id}`}
          className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-1.5 text-left"
        >
          <span
            id={`provider-title-${toolId}-${provider.id}`}
            className="flex max-w-full flex-wrap items-center gap-2"
          >
            <span className="truncate font-medium">{provider.name}</span>
            {isCurrent && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">当前使用</Badge>
            )}
            {isSelected && !isCurrent && <Badge variant="outline">已选择</Badge>}
          </span>
          <span
            id={`provider-description-${toolId}-${provider.id}`}
            className="flex max-w-full flex-wrap gap-x-4 gap-y-1 text-xs font-normal leading-5 text-muted-foreground"
          >
            <span>模型：{provider.models[toolId]}</span>
            <span className="truncate font-mono" title={provider.baseUrl}>
              地址：{provider.baseUrl}
            </span>
            <span>Key：{provider.maskedApiKey}</span>
          </span>
        </FieldLabel>
      </Field>
      <ItemActions className="flex-wrap lg:justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={busy}>
              {pending ? <Spinner aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
              应用
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <RotateCcw aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>应用 {provider.name}？</AlertDialogTitle>
              <AlertDialogDescription className="wrap-break-word">
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
        <AlertDialog>
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2 aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>删除 {provider.name}？</AlertDialogTitle>
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
      </ItemActions>
      <div className="min-w-0 lg:col-span-2">
        <ConfigPreview input={{ toolId, providerId: provider.id }} disabled={busy} />
      </div>
    </Item>
  )
}

function StatusBadge({ status }: { status: ToolStatus }): React.JSX.Element {
  if (status.fileState === 'invalid' || status.fileState === 'unreadable') {
    return <Badge variant="destructive">需处理</Badge>
  }
  if (status.currentProviderId) {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">已匹配</Badge>
  }
  return <Badge variant="outline">{status.fileState === 'missing' ? '未创建' : '未匹配'}</Badge>
}
